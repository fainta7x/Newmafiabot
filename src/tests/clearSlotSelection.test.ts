import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { loadEveningSlotPlan } from '../server/services/eveningSlotPlanningService.ts';
import { replacePlayerSlotSelection } from '../server/services/eveningSlotWritesService.ts';
import { setParticipantResponse } from '../server/services/eveningParticipantState.ts';

let db: DatabaseWrapper | null = null;
afterEach(() => { try { db?.sqlite.close(); } catch {} db = null; });

const setup = async () => {
  db = createDatabaseConnection(':memory:');
  await ensureTelegramPublishingSchema(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
    VALUES ('ev1', 'Игровой вечер', '2030-08-14T20:00:00+03:00', '2030-08-15T02:00:00+03:00', 'Europe/Moscow', 'Суп с Котом', 'CASUAL', 'published', 20, 400, ?, ?)`, [now, now]);
  await db.run("INSERT INTO players (id, nickname, created_at, updated_at) VALUES ('p1', 'Денди', ?, ?)", [now, now]);
  const plan = await loadEveningSlotPlan(db, 'ev1');
  return plan.slots.map((slot) => slot.id);
};
const answerOf = async () => (await db!.get<any>("SELECT response_status FROM evening_participants WHERE evening_id = 'ev1' AND player_id = 'p1'"))?.response_status;

describe('«Очистить выбор» (owner, 2026-10-13)', () => {
  it('puts the player back to «нет ответа», not to «не иду»', async () => {
    const ids = await setup();
    await replacePlayerSlotSelection(db!, 'ev1', 'p1', ids.slice(0, 2));
    expect(await answerOf()).toBe('going');
    await replacePlayerSlotSelection(db!, 'ev1', 'p1', []);
    expect(await answerOf()).toBe('unanswered');
  });

  it('keeps an explicit «не иду» as it is', async () => {
    const ids = await setup();
    await replacePlayerSlotSelection(db!, 'ev1', 'p1', ids.slice(0, 1));
    const participant = await db!.get<any>("SELECT id FROM evening_participants WHERE player_id = 'p1'");
    await setParticipantResponse(db!, String(participant.id), 'declined', { byPlayer: true, source: 'telegram_quick_rsvp' });
    await replacePlayerSlotSelection(db!, 'ev1', 'p1', []);
    expect(await answerOf()).toBe('declined');
  });
});
