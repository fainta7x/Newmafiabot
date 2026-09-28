import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';

let db: DatabaseWrapper | null = null;
afterEach(() => { try { db?.sqlite.close(); } catch {} db = null; });

const setup = async (publicChat: string | null) => {
  db = createDatabaseConnection(':memory:');
  await ensureTelegramPublishingSchema(db);
  const now = new Date().toISOString();
  await db.run("UPDATE telegram_destinations SET chat_id = ?, active = ? WHERE id = 'public'", [publicChat, publicChat ? 1 : 0]);
  await db.run("UPDATE telegram_destinations SET chat_id = '-300', active = 1 WHERE id = 'novice'");
  for (const [id, format] of [['announced', 'NOVICE'], ['fresh', 'NOVICE'], ['club', 'CASUAL']]) {
    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, capacity, default_price, created_at, updated_at)
       VALUES (?, 'Вечер', '2026-10-02T19:00:00+03:00', 'Europe/Moscow', ?, 'published', 20, 0, ?, ?)`,
      [id, format, now, now],
    );
  }
  for (const [id, destination] of [['announced', 'novice'], ['club', 'club']]) {
    await db.run(
      `INSERT INTO evening_telegram_publications (evening_id, destination_id, chat_id, message_id, sent_at, updated_at)
       VALUES (?, ?, '-300', 1, ?, ?)`,
      [id, destination, now, now],
    );
  }
  await db.run('DELETE FROM telegram_sync_outbox');
  await ensureTelegramPublishingSchema(db);
  return (await db.all<{ entity_id: string }>("SELECT entity_id FROM telegram_sync_outbox WHERE kind = 'evening'")).map((row) => row.entity_id);
};

describe('novice invitation reconcile', () => {
  it('syncs only novice evenings already announced in the novice group', async () => {
    expect(await setup('-100')).toEqual(['announced']);
  });

  it('does nothing while the entry channel is not connected', async () => {
    expect(await setup(null)).toEqual([]);
  });
});
