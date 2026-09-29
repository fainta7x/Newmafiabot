import type { DatabaseWrapper } from './index.ts';
import { weeklyAnnouncementDueMs } from '../lib/weeklyAnnouncementDue.ts';

// The novice group «Игры для новичков», announcements topic (owner, 2026-09-29).
export const NOVICE_GROUP_CHAT_ID = '-1003925510303';
export const NOVICE_GROUP_TOPIC_ID = 128;

export const TELEGRAM_DESTINATION_IDS = ['public', 'novice', 'club', 'rating'] as const;
export type TelegramDestinationId = (typeof TELEGRAM_DESTINATION_IDS)[number];

const DEFAULT_DESTINATIONS: Array<{ id: TelegramDestinationId; name: string; description: string }> = [
  {
    id: 'public',
    name: 'Входной канал',
    description: 'Канал «Мафия в Туле 2LA Noire»: закреплённый маршрутизатор и пригласительные посты вечеров новичков.',
  },
  {
    id: 'novice',
    name: 'Игры для новичков',
    description: 'Группа новичков. Сюда публикуется обычный анонс вечера новичков.',
  },
  {
    id: 'club',
    name: 'Основной клуб',
    description: 'Группа «2LA Noire мафия в Туле». Сюда публикуется анонс клубного вечера.',
  },
  {
    id: 'rating',
    name: 'Рейтинг и турниры',
    description: 'Закрытый канал допущенных игроков. RATING и TOURNAMENT.',
  },
];

const eveningOutboxUpsertSql = (entityExpression: string) => `
  INSERT INTO telegram_sync_outbox
    (sync_key, kind, entity_id, version, attempt_count, requested_at, last_attempt_at, next_attempt_at, last_error)
  VALUES
    ('evening:' || ${entityExpression}, 'evening', ${entityExpression}, 1, 0,
     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, NULL, NULL)
  ON CONFLICT(sync_key) DO UPDATE SET
    entity_id = excluded.entity_id,
    version = telegram_sync_outbox.version + 1,
    attempt_count = 0,
    requested_at = excluded.requested_at,
    last_attempt_at = NULL,
    next_attempt_at = NULL,
    last_error = NULL;
`;

const tournamentDispatchUpsertSql = (entityExpression: string) => `
  INSERT INTO telegram_dispatch_outbox
    (dispatch_key, kind, entity_id, version, attempt_count, requested_at, last_attempt_at, next_attempt_at, last_error)
  VALUES
    ('tournament:' || ${entityExpression}, 'tournament', ${entityExpression}, 1, 0,
     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, NULL, NULL)
  ON CONFLICT(dispatch_key) DO UPDATE SET
    entity_id = excluded.entity_id,
    version = telegram_dispatch_outbox.version + 1,
    attempt_count = 0,
    requested_at = excluded.requested_at,
    last_attempt_at = NULL,
    next_attempt_at = NULL,
    last_error = NULL;
`;

export async function ensureTelegramPublishingSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_destinations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      chat_id TEXT,
      topic_id INTEGER,
      invite_url TEXT,
      active INTEGER NOT NULL DEFAULT 0,
      router_message_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evening_telegram_publications (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      destination_id TEXT NOT NULL REFERENCES telegram_destinations(id) ON DELETE CASCADE,
      chat_id TEXT NOT NULL,
      topic_id INTEGER,
      message_id INTEGER NOT NULL,
      sent_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (evening_id, destination_id)
    );

    CREATE TABLE IF NOT EXISTS tournament_telegram_publications (
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      destination_id TEXT NOT NULL REFERENCES telegram_destinations(id) ON DELETE CASCADE,
      chat_id TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      sent_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tournament_id, destination_id)
    );

    CREATE TABLE IF NOT EXISTS telegram_sync_outbox (
      sync_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('evening', 'public_router')),
      entity_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      requested_at TEXT NOT NULL,
      last_attempt_at TEXT,
      next_attempt_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS telegram_dispatch_outbox (
      dispatch_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('tournament', 'announcement', 'reminder')),
      entity_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      requested_at TEXT NOT NULL,
      last_attempt_at TEXT,
      next_attempt_at TEXT,
      last_error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_evening_telegram_publications_destination
      ON evening_telegram_publications(destination_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tournament_telegram_publications_destination
      ON tournament_telegram_publications(destination_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_telegram_sync_outbox_due
      ON telegram_sync_outbox(next_attempt_at, requested_at);
    CREATE INDEX IF NOT EXISTS idx_telegram_dispatch_outbox_due
      ON telegram_dispatch_outbox(next_attempt_at, requested_at);
  `);

  // Keep CREATE TRIGGER as single statements. Turso's exec compatibility splits scripts on semicolons,
  // while run() passes the whole trigger body through unchanged.
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_evening_telegram_sync_insert
    AFTER INSERT ON game_evenings
    BEGIN
      ${eveningOutboxUpsertSql('NEW.id')}
    END
  `);
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_evening_telegram_sync_update
    AFTER UPDATE ON game_evenings
    BEGIN
      ${eveningOutboxUpsertSql('NEW.id')}
    END
  `);
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_evening_telegram_sync_delete
    AFTER DELETE ON game_evenings
    BEGIN
      DELETE FROM telegram_sync_outbox WHERE sync_key = 'evening:' || OLD.id;
      DELETE FROM telegram_dispatch_outbox WHERE dispatch_key IN ('announcement:' || OLD.id, 'reminder:' || OLD.id);
      INSERT INTO telegram_sync_outbox
        (sync_key, kind, entity_id, version, attempt_count, requested_at, last_attempt_at, next_attempt_at, last_error)
      VALUES
        ('public-router', 'public_router', NULL, 1, 0,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, NULL, NULL)
      ON CONFLICT(sync_key) DO UPDATE SET
        version = telegram_sync_outbox.version + 1,
        attempt_count = 0,
        requested_at = excluded.requested_at,
        last_attempt_at = NULL,
        next_attempt_at = NULL,
        last_error = NULL;
    END
  `);

  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_evening_participant_telegram_sync_insert
    AFTER INSERT ON evening_participants
    WHEN EXISTS (SELECT 1 FROM game_evenings WHERE id = NEW.evening_id)
    BEGIN
      ${eveningOutboxUpsertSql('NEW.evening_id')}
    END
  `);
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_evening_participant_telegram_sync_update
    AFTER UPDATE OF evening_id, player_id, table_id, response_status, registration_status, attendance_status, arrival_status
    ON evening_participants
    WHEN EXISTS (SELECT 1 FROM game_evenings WHERE id = NEW.evening_id)
    BEGIN
      ${eveningOutboxUpsertSql('NEW.evening_id')}
    END
  `);
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_evening_participant_telegram_sync_delete
    AFTER DELETE ON evening_participants
    WHEN EXISTS (SELECT 1 FROM game_evenings WHERE id = OLD.evening_id)
    BEGIN
      ${eveningOutboxUpsertSql('OLD.evening_id')}
    END
  `);
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_tournament_telegram_dispatch_update
    AFTER UPDATE OF title, date, venue, stage, status, chief_judge_name, notes, game_count
    ON tournaments
    WHEN NEW.status <> 'draft'
      OR EXISTS (SELECT 1 FROM tournament_telegram_publications WHERE tournament_id = NEW.id)
    BEGIN
      ${tournamentDispatchUpsertSql('NEW.id')}
    END
  `);
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_tournament_participant_telegram_dispatch_insert
    AFTER INSERT ON tournament_participants
    WHEN EXISTS (
      SELECT 1 FROM tournaments t
       WHERE t.id = NEW.tournament_id
         AND (t.status <> 'draft' OR EXISTS (
           SELECT 1 FROM tournament_telegram_publications p WHERE p.tournament_id = t.id
         ))
    )
    BEGIN
      ${tournamentDispatchUpsertSql('NEW.tournament_id')}
    END
  `);
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_tournament_participant_telegram_dispatch_update
    AFTER UPDATE OF player_id, display_name, participant_number, tournament_id
    ON tournament_participants
    WHEN EXISTS (
      SELECT 1 FROM tournaments t
       WHERE t.id = NEW.tournament_id
         AND (t.status <> 'draft' OR EXISTS (
           SELECT 1 FROM tournament_telegram_publications p WHERE p.tournament_id = t.id
         ))
    )
    BEGIN
      ${tournamentDispatchUpsertSql('NEW.tournament_id')}
    END
  `);
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_tournament_participant_telegram_dispatch_delete
    AFTER DELETE ON tournament_participants
    WHEN EXISTS (
      SELECT 1 FROM tournaments t
       WHERE t.id = OLD.tournament_id
         AND (t.status <> 'draft' OR EXISTS (
           SELECT 1 FROM tournament_telegram_publications p WHERE p.tournament_id = t.id
         ))
    )
    BEGIN
      ${tournamentDispatchUpsertSql('OLD.tournament_id')}
    END
  `);
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_tournament_telegram_dispatch_delete
    AFTER DELETE ON tournaments
    BEGIN
      DELETE FROM telegram_dispatch_outbox WHERE dispatch_key = 'tournament:' || OLD.id;
    END
  `);

  const now = new Date().toISOString();
  for (const destination of DEFAULT_DESTINATIONS) {
    await db.run(
      `INSERT OR IGNORE INTO telegram_destinations
         (id, name, description, active, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [destination.id, destination.name, destination.description, now, now],
    );
    await db.run(
      `UPDATE telegram_destinations
          SET name = ?, description = ?
        WHERE id = ?`,
      [destination.name, destination.description, destination.id],
    );
  }

  // A database replacement must not silently disconnect Telegram publishing.
  // Rehydrate only missing destination fields from environment variables; never
  // overwrite values that were explicitly configured in CRM.
  const destinationEnv: Partial<Record<TelegramDestinationId, { chatId?: string; topicId?: string }>> = {
    public: { chatId: process.env.TELEGRAM_PUBLIC_CHAT_ID },
    novice: {
      chatId: process.env.TELEGRAM_NOVICE_CHAT_ID,
      topicId: process.env.TELEGRAM_NOVICE_TOPIC_ID,
    },
    club: {
      // Keep the Node-side bootstrap aligned with the Python bot defaults.
      // The legacy bot has always used this forum chat/topic when env overrides
      // are absent, so a DB replacement must not leave the CRM disconnected.
      chatId: process.env.TELEGRAM_CLUB_CHAT_ID || process.env.TEST_GROUP_ID || '-1001628595679',
      topicId: process.env.TELEGRAM_CLUB_TOPIC_ID || process.env.ANNOUNCE_TOPIC_ID || '5912',
    },
    rating: { chatId: process.env.TELEGRAM_RATING_CHAT_ID },
  };

  for (const destinationId of TELEGRAM_DESTINATION_IDS) {
    const fallback = destinationEnv[destinationId];
    const chatId = String(fallback?.chatId || '').trim();
    if (!chatId) continue;
    const topicRaw = String(fallback?.topicId || '').trim();
    const topicId = /^\d+$/.test(topicRaw) && Number(topicRaw) > 0 ? Number(topicRaw) : null;
    await db.run(
      `UPDATE telegram_destinations
          SET chat_id = CASE WHEN chat_id IS NULL OR TRIM(chat_id) = '' THEN ? ELSE chat_id END,
              topic_id = CASE WHEN topic_id IS NULL THEN ? ELSE topic_id END,
              active = CASE WHEN chat_id IS NULL OR TRIM(chat_id) = '' THEN 1 ELSE active END,
              updated_at = CASE WHEN chat_id IS NULL OR TRIM(chat_id) = '' THEN ? ELSE updated_at END
        WHERE id = ?`,
      [chatId, topicId, now, destinationId],
    );
  }

  // Owner request 2026-09-29: the novice group «Игры для новичков» (announcements topic). Set once;
  // later changes in CRM «Ещё → Telegram» are kept. Open novice evenings whose announcement is already
  // due are then synced once, so the missed post appears in the group.
  await db.run('CREATE TABLE IF NOT EXISTS app_data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const noviceGroupKey = '2026-09-novice-group-destination';
  if (!(await db.get('SELECT id FROM app_data_migrations WHERE id = ?', [noviceGroupKey]))) {
    await db.run(
      `UPDATE telegram_destinations SET chat_id = ?, topic_id = ?, active = 1, updated_at = ? WHERE id = 'novice'`,
      [NOVICE_GROUP_CHAT_ID, NOVICE_GROUP_TOPIC_ID, now],
    );
    // A post of an open evening recorded for another chat or topic would keep being edited there;
    // forget it so the evening is posted in the new group (the old message stays where it was).
    await db.run(
      `DELETE FROM evening_telegram_publications
        WHERE destination_id = 'novice'
          AND (chat_id <> ? OR COALESCE(topic_id, 0) <> ?)
          AND evening_id IN (
            SELECT id FROM game_evenings
             WHERE status IN ('published', 'active') AND settled_at IS NULL AND datetime(starts_at) > datetime('now'))`,
      [NOVICE_GROUP_CHAT_ID, NOVICE_GROUP_TOPIC_ID],
    );
    const openNovice = await db.all<{ id: string; starts_at: string }>(
      `SELECT e.id, e.starts_at FROM game_evenings e
        WHERE UPPER(COALESCE(e.format, '')) = 'NOVICE'
          AND e.status IN ('published', 'active')
          AND e.settled_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM evening_telegram_publications p WHERE p.evening_id = e.id AND p.destination_id = 'novice')`,
    );
    const nowMs = Date.now();
    for (const evening of openNovice) {
      const startMs = new Date(evening.starts_at).getTime();
      if (!Number.isFinite(startMs) || startMs <= nowMs || nowMs < weeklyAnnouncementDueMs(startMs)) continue;
      await db.run(eveningOutboxUpsertSql('?'), [evening.id, evening.id]);
    }
    await db.run('INSERT INTO app_data_migrations (id, applied_at) VALUES (?, ?)', [noviceGroupKey, now]);
  }

  // Do not enqueue every open evening here. This schema function is called not only
  // at process startup but also by the weekly calendar reconciler, so bulk-enqueueing
  // here can publish every future Friday at once after a DB replacement.
  //
  // As a safety net, drop only premature, never-published evening sync jobs that may
  // have been left by an older build. The weekly automation will enqueue them when
  // their real announcement window arrives.
  await db.run(
    `DELETE FROM telegram_sync_outbox
      WHERE kind = 'evening'
        AND entity_id IN (
          SELECT e.id
            FROM game_evenings e
           WHERE e.status IN ('published', 'active')
             AND e.settled_at IS NULL
             AND datetime(e.starts_at) > datetime('now', '+4 days', '+1 hour')
             AND NOT EXISTS (
               SELECT 1
                 FROM evening_telegram_publications p
                WHERE p.evening_id = e.id
             )
        )`,
  );

  // Novice evenings announced before the entry channel carried invitations: sync them once so
  // the invitation appears there. Only evenings already announced in the novice group qualify,
  // so nothing new is published early, and only while the entry channel is connected.
  await db.run(
    `INSERT INTO telegram_sync_outbox
       (sync_key, kind, entity_id, version, attempt_count, requested_at, last_attempt_at, next_attempt_at, last_error)
     SELECT 'evening:' || e.id, 'evening', e.id, 1, 0, ?, NULL, NULL, NULL
       FROM game_evenings e
      WHERE UPPER(COALESCE(e.format, '')) = 'NOVICE'
        AND e.status IN ('published', 'active')
        AND e.settled_at IS NULL
        AND EXISTS (SELECT 1 FROM evening_telegram_publications p WHERE p.evening_id = e.id AND p.destination_id = 'novice')
        AND NOT EXISTS (SELECT 1 FROM evening_telegram_publications p WHERE p.evening_id = e.id AND p.destination_id = 'public')
        AND EXISTS (SELECT 1 FROM telegram_destinations d WHERE d.id = 'public' AND d.active = 1 AND TRIM(COALESCE(d.chat_id, '')) <> '')
     ON CONFLICT(sync_key) DO NOTHING`,
    [now],
  );
}

export function isTelegramDestinationId(value: unknown): value is TelegramDestinationId {
  return TELEGRAM_DESTINATION_IDS.includes(String(value) as TelegramDestinationId);
}
