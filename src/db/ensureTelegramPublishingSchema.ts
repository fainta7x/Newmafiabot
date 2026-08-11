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

    CREATE INDEX IF NOT EXISTS idx_evening_telegram_publications_destination
      ON evening_telegram_publications(destination_id, updated_at DESC);
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
