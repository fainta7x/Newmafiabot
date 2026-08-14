import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { loadEveningSlotPlan, replacePlayerSlotSelection } from '../server/services/eveningSlotPlanningService.ts';

let db: DatabaseWrapper | null = null;

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

describe('Telegram evening roster source', () => {
  it('keeps slot participants, arrival plan and Telegram sync in canonical slot data', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO game_evenings
        (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
       VALUES ('ev-telegram-roster', 'Игровой вечер', '2030-08-14T20:00:00+03:00', '2030-08-15T02:00:00+03:00',
               'Europe/Moscow', 'Суп с Котом', 'CASUAL', 'published', 20, 400, ?, ?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO players (id, nickname, created_at, updated_at)
       VALUES ('player-roster', 'Джокер', ?, ?)`,
      [now, now],
    );

    const initial = await loadEveningSlotPlan(db, 'ev-telegram-roster');
    expect(initial.slots).toHaveLength(6);
    expect(initial.event.price_per_game).toBe(100);

    await db.run("DELETE FROM telegram_sync_outbox WHERE sync_key='evening:ev-telegram-roster'");
    const chosenIds = initial.slots.slice(0, 5).map((slot) => slot.id);
    const saved = await replacePlayerSlotSelection(db, 'ev-telegram-roster', 'player-roster', chosenIds);

    expect(saved.selection.games).toBe(5);
    expect(saved.selection.total).toBe(400);
    expect(saved.slots[0].participants).toEqual([{ id: 'player-roster', nickname: 'Джокер' }]);
    expect(saved.slots[4].participants).toEqual([{ id: 'player-roster', nickname: 'Джокер' }]);
    expect(saved.slots[5].participants).toEqual([]);

    const queued = await db.get<any>("SELECT kind, entity_id FROM telegram_sync_outbox WHERE sync_key='evening:ev-telegram-roster'");
    expect(queued).toMatchObject({ kind: 'evening', entity_id: 'ev-telegram-roster' });
  });
});
