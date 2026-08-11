import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';

let db: DatabaseWrapper | null = null;

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

describe('Telegram publishing destinations', () => {
  it('seeds the four club destinations disabled by default', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);

    const rows = await db.all<any>('SELECT id, active FROM telegram_destinations ORDER BY id ASC');
    expect(rows.map((row) => row.id).sort()).toEqual(['club', 'novice', 'public', 'rating']);
    expect(rows.every((row) => Number(row.active) === 0)).toBe(true);
  });

  it('keeps publication identity unique per event and destination', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
       VALUES ('ev-test', 'Тест', ?, 'Europe/Moscow', 'Тула', 'CASUAL', 'published', 20, 400, ?, ?)`,
      [now, now, now],
    );
    await db.run(
      `INSERT INTO evening_telegram_publications
        (evening_id, destination_id, chat_id, topic_id, message_id, sent_at, updated_at)
       VALUES ('ev-test', 'club', '-1001', 42, 100, ?, ?)`,
      [now, now],
    );

    await expect(db.run(
      `INSERT INTO evening_telegram_publications
        (evening_id, destination_id, chat_id, topic_id, message_id, sent_at, updated_at)
       VALUES ('ev-test', 'club', '-1001', 42, 101, ?, ?)`,
      [now, now],
    )).rejects.toThrow();
  });
});
