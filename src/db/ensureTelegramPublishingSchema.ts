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

    CREATE INDEX IF NOT EXISTS idx_evening_telegram_publications_destination
      ON evening_telegram_publications(destination_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tournament_telegram_publications_destination
      ON tournament_telegram_publications(destination_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_telegram_sync_outbox_due
      ON telegram_sync_outbox(next_attempt_at, requested_at);
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
