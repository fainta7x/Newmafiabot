import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { setParticipantResponse } from '../server/services/eveningParticipantState.ts';

let db: DatabaseWrapper | null = null;
const saved = { ...process.env };
beforeEach(() => {
  process.env.ORGANIZER_NOTIFICATION_IDS = '777';
  delete process.env.TELEGRAM_BOT_TOKEN;
});
afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
  process.env = { ...saved };
});

const setup = async () => {
  db = createDatabaseConnection(':memory:');
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, capacity, default_price, created_at, updated_at)
     VALUES ('ev', 'Вечер новичков', '2026-10-02T19:00:00+03:00', 'Europe/Moscow', 'NOVICE', 'published', 20, 0, ?, ?)`,
    [now, now],
  );
  await db.run("INSERT INTO players (id, nickname, game_level, created_at, updated_at) VALUES ('p', 'Лиса', 'novice', ?, ?)", [now, now]);
  await db.run(
    `INSERT INTO evening_participants (id, evening_id, player_id, response_status, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, registered_at, created_at, updated_at)
     VALUES ('ep', 'ev', 'p', 'unanswered', 'unanswered', 'pending', 'unknown', 'waived', 0, 0, ?, ?, ?)`,
    [now, now, now],
  );
};

const organizerTexts = async () => (await db!.all<{ text: string }>(
  "SELECT text FROM telegram_message_outbox WHERE category = 'organizer' ORDER BY created_at, rowid",
)).map((row) => row.text);

describe('organizer alerts about sign-ups and cancellations', () => {
  it('tells the organizer when a player signs up and when they cancel after «Иду»', async () => {
    await setup();
    await setParticipantResponse(db!, 'ep', 'going', { byPlayer: true });
    await setParticipantResponse(db!, 'ep', 'late', { byPlayer: true });
    await setParticipantResponse(db!, 'ep', 'declined', { byPlayer: true });
    const texts = await organizerTexts();
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/^✅ Лиса записался на «Вечер новичков» .* · придёт впервые$/);
    expect(texts[1]).toMatch(/^❌ Лиса отказался от «Вечер новичков» .* — раньше отвечал «Иду»$/);
  });

  it('stays quiet for organizer edits and for «думаю»', async () => {
    await setup();
    await setParticipantResponse(db!, 'ep', 'going');
    await setParticipantResponse(db!, 'ep', 'thinking', { byPlayer: true });
    expect(await organizerTexts()).toEqual([]);
  });
});
