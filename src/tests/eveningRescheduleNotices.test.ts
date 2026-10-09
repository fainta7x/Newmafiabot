import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/services/eveningTodayPostService.ts', () => ({
  sendTelegram: vi.fn(async () => ({ status: 'published', error: null })),
  sendVk: vi.fn(async () => ({ status: 'published', error: null })),
}));
vi.mock('../server/services/personalNotificationRouterService.ts', () => ({
  queuePersonalNotification: vi.fn(async () => ({ created: true })),
}));
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { buildEveningRescheduleText, notifyEveningRescheduled } from '../server/services/eveningRescheduleService.ts';
import { queuePersonalNotification } from '../server/services/personalNotificationRouterService.ts';
import { sendTelegram, sendVk } from '../server/services/eveningTodayPostService.ts';

let db: DatabaseWrapper | null = null;
afterEach(() => { try { db?.sqlite.close(); } catch {} db = null; vi.clearAllMocks(); });

describe('published evening reschedule notices', () => {
  it('queues only signed-up / considering players and sends one correction per channel', async () => {
    db = createDatabaseConnection(':memory:');
    const now = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('move-one','Клубная пятница','2026-10-16T21:00:00+03:00','Europe/Moscow','CASUAL','published',20,100,?,?)`, [now, now]);
    for (const [id, response] of [['going', 'going'], ['thinking', 'thinking'], ['declined', 'declined']]) {
      await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?, ?, ?, ?)', [id, id, now, now]);
      await db.run(`INSERT INTO evening_participants
        (id, evening_id, player_id, registration_status, response_status, attendance_status, payment_status, created_at, updated_at)
        VALUES (?, 'move-one', ?, ?, ?, 'pending', 'unpaid', ?, ?)`, [id, id, response, response, now, now]);
    }
    const result = await notifyEveningRescheduled(db, 'move-one', '2026-10-16T21:00:00+03:00', '2026-10-17T19:00:00+03:00');
    expect(result).toMatchObject({ changed: true, personalQueued: 2, telegram: 'published', vk: 'published' });
    expect(vi.mocked(queuePersonalNotification).mock.calls.map((call) => call[1].playerId).sort()).toEqual(['going', 'thinking']);
    expect(sendTelegram).toHaveBeenCalledTimes(1);
    expect(sendVk).toHaveBeenCalledTimes(1);
    expect((await db.get<any>('SELECT COUNT(*) AS n FROM evening_reschedule_notices WHERE evening_id = ?', ['move-one']))?.n).toBe(1);
    await notifyEveningRescheduled(db, 'move-one', '2026-10-17T19:00:00+03:00', '2026-10-17T19:00:00+03:00');
    expect(sendTelegram).toHaveBeenCalledTimes(1);
  });
  it('plain-language notice names both Moscow-local times', () => {
    const text = buildEveningRescheduleText('Пятница', '2026-10-16T21:00:00+03:00', '2026-10-17T19:00:00+03:00');
    expect(text).toContain('21:00');
    expect(text).toContain('19:00');
    expect(text).toContain('запись сохраняется');
  });
});
