import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  ensureRollingFridayCalendar,
  reconcileWeeklyEveningAutomation,
} from '../server/services/weeklyEveningAutomationService.ts';

const openDatabases: DatabaseWrapper[] = [];
const createDb = () => {
  const db = createDatabaseConnection(':memory:');
  openDatabases.push(db);
  return db;
};

afterEach(() => {
  while (openDatabases.length) {
    try { openDatabases.pop()?.sqlite.close(); } catch { /* already closed */ }
  }
});

describe('weekly Friday evening automation', () => {
  it('keeps the next 35 days of Fridays published in the app without prematurely posting to Telegram', async () => {
    const db = createDb();
    const result = await ensureRollingFridayCalendar(db, new Date('2026-08-22T10:00:00.000Z'));

    expect(result.created).toHaveLength(5);
    const evenings = await db.all<any>('SELECT starts_at, ends_at, format, status, default_price FROM game_evenings ORDER BY starts_at ASC');
    expect(evenings.map((item) => String(item.starts_at).slice(0, 10))).toEqual([
      '2026-08-28', '2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25',
    ]);
    expect(evenings.every((item) => item.status === 'published' && item.format === 'CASUAL')).toBe(true);
    expect(evenings.every((item) => Number(item.default_price) === 100)).toBe(true);

    const queued = await db.get<any>('SELECT COUNT(*) AS count FROM telegram_sync_outbox');
    expect(Number(queued?.count || 0)).toBe(0);
  });

  it('announces the upcoming Friday after Monday 19:00 Moscow exactly once across Telegram channel, DMs and VK', async () => {
    const db = createDb();
    await ensureRollingFridayCalendar(db, new Date('2026-08-22T10:00:00.000Z'));

    const calls = { channel: [] as string[], dm: [] as string[], vk: [] as string[], drain: 0 };
    const delivery = {
      enqueueTelegramChannel: async (_db: DatabaseWrapper, eveningId: string) => { calls.channel.push(eveningId); },
      enqueueTelegramDm: async (_db: DatabaseWrapper, eveningId: string) => { calls.dm.push(eveningId); },
      drainTelegram: async () => { calls.drain += 1; },
      syncVk: async (_db: DatabaseWrapper, eveningId: string) => { calls.vk.push(eveningId); },
    };

    const monday1901Moscow = new Date('2026-08-24T16:01:00.000Z');
    const first = await reconcileWeeklyEveningAutomation(db, {
      now: monday1901Moscow,
      baseUrl: 'https://example.test',
      delivery,
    });

    expect(first.success).toBe(true);
    expect(first.announcements.filter((item) => item.status === 'done')).toHaveLength(1);
    const target = await db.get<any>("SELECT id FROM game_evenings WHERE substr(starts_at,1,10)='2026-08-28'");
    expect(calls.channel).toEqual([target?.id]);
    expect(calls.dm).toEqual([target?.id]);
    expect(calls.vk).toEqual([target?.id]);
    expect(calls.drain).toBe(1);

    const second = await reconcileWeeklyEveningAutomation(db, {
      now: new Date('2026-08-24T16:20:00.000Z'),
      baseUrl: 'https://example.test',
      delivery,
    });

    expect(second.success).toBe(true);
    expect(calls.channel).toHaveLength(1);
    expect(calls.dm).toHaveLength(1);
    expect(calls.vk).toHaveLength(1);
    expect(calls.drain).toBe(1);

    const run = await db.get<any>(
      'SELECT status, completed_at FROM club_weekly_automation_runs WHERE automation_key = ?',
      [`weekly-announcement:${target?.id}`],
    );
    expect(run?.status).toBe('done');
    expect(run?.completed_at).toBeTruthy();
  });
});
