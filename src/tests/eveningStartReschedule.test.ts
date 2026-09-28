import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/services/vkLiveEveningSyncWorker.ts', () => ({ kickVkLiveEveningSync: vi.fn() }));

import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { loadEveningSlotPlan, updateEveningSlotSettings } from '../server/services/eveningSlotPlanningService.ts';
import { kickVkLiveEveningSync } from '../server/services/vkLiveEveningSyncWorker.ts';

let db: DatabaseWrapper | null = null;

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
  vi.mocked(kickVkLiveEveningSync).mockClear();
});

const createEvening = async (status: string) => {
  db = createDatabaseConnection(':memory:');
  await ensureTelegramPublishingSchema(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO game_evenings
      (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
     VALUES ('ev-move', 'Игровой вечер', '2026-10-02T20:00:00+03:00', '2026-10-03T02:00:00+03:00',
             'Europe/Moscow', 'Суп с Котом', 'CASUAL', ?, 20, 100, ?, ?)`,
    [status, now, now],
  );
  return loadEveningSlotPlan(db, 'ev-move');
};

describe('«Перенести начало»', () => {
  it('moves every game with the start and refreshes the posts of a published evening', async () => {
    const plan = await createEvening('published');
    const moved = await updateEveningSlotSettings(db!, 'ev-move', {
      planned_slots: plan.event.slot_count,
      slot_duration_minutes: plan.event.slot_duration_minutes,
      price_per_game: plan.event.price_per_game,
      starts_at: '2026-10-02T21:00:00+03:00',
    });

    expect(new Date(moved.event.starts_at).toISOString()).toBe('2026-10-02T18:00:00.000Z');
    expect(moved.slots.map((slot) => new Date(slot.starts_at).toISOString().slice(11, 16))).toEqual(['18:00', '19:00', '20:00', '21:00', '22:00', '23:00']);
    const outbox = await db!.get<any>("SELECT entity_id FROM telegram_sync_outbox WHERE sync_key = 'evening:ev-move'");
    expect(outbox?.entity_id).toBe('ev-move');
    expect(kickVkLiveEveningSync).toHaveBeenCalledTimes(1);
  });

  it('keeps the start of an evening that is already running', async () => {
    const plan = await createEvening('active');
    await expect(updateEveningSlotSettings(db!, 'ev-move', {
      planned_slots: plan.event.slot_count,
      slot_duration_minutes: plan.event.slot_duration_minutes,
      price_per_game: plan.event.price_per_game,
      starts_at: '2026-10-02T21:00:00+03:00',
    })).rejects.toThrow('только до начала вечера');
  });
});
