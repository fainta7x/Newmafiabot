import type { DatabaseWrapper } from './index.ts';

export const TELEGRAM_DESTINATION_IDS = ['public', 'novice', 'club', 'rating'] as const;
export type TelegramDestinationId = (typeof TELEGRAM_DESTINATION_IDS)[number];

const DEFAULT_DESTINATIONS: Array<{ id: TelegramDestinationId; name: string; description: string }> = [
  {
    id: 'public',
    name: 'Публичный канал',
    description: 'Входной канал «Мафия в Туле»: живой маршрутизатор и публичные анонсы NOVICE/CASUAL.',
  },
  {
    id: 'novice',
    name: 'Школа мафии',
    description: 'Форум-группа новичков. NOVICE публикуется в теме «Анонсы игр».',
  },
  {
    id: 'club',
    name: 'Основной клуб',
    description: 'Основная форум-группа. CASUAL публикуется в теме «Запись на игровой вечер».',
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
}

export function isTelegramDestinationId(value: unknown): value is TelegramDestinationId {
  return TELEGRAM_DESTINATION_IDS.includes(String(value) as TelegramDestinationId);
}
