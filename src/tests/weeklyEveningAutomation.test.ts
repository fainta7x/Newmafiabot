import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureWeeklyEveningAutomationSchema } from '../db/ensureWeeklyEveningAutomationSchema.ts';
import { runEveningShortfallChecks } from '../server/services/eveningShortfallService.ts';
import {
  ensureRollingFridayCalendar,
  reconcileWeeklyEveningAutomation,
  runDueWeeklyAnnouncements,
} from '../server/services/weeklyEveningAutomationService.ts';

const openDatabases: DatabaseWrapper[] = [];
const previousAutomationFlag = process.env.WEEKLY_EVENING_AUTOMATION_ENABLED;
beforeEach(() => { process.env.WEEKLY_EVENING_AUTOMATION_ENABLED = 'true'; });
const createDb = () => {
  const db = createDatabaseConnection(':memory:');
  openDatabases.push(db);
  return db;
};

afterEach(() => {
  if (previousAutomationFlag === undefined) delete process.env.WEEKLY_EVENING_AUTOMATION_ENABLED;
  else process.env.WEEKLY_EVENING_AUTOMATION_ENABLED = previousAutomationFlag;
  while (openDatabases.length) {
    try { openDatabases.pop()?.sqlite.close(); } catch { /* already closed */ }
  }
});

describe('weekly Friday evening automation', () => {
  it('cannot alternate creation and shortfall cancellation of the same Friday', async () => {
    const db = createDb();
    const now = new Date('2026-08-28T16:10:00.000Z'); // Friday, 19:10 Moscow
    await ensureRollingFridayCalendar(db, now);
    const evening = await db.get<any>("SELECT id FROM game_evenings WHERE substr(starts_at,1,10)='2026-08-28'");
    expect(evening?.id).toBeTruthy();
    await runEveningShortfallChecks(db, now.getTime(), async () => ({ success: true }));
    expect(await db.get<any>('SELECT status FROM game_evenings WHERE id=?', [evening.id])).toMatchObject({ status: 'cancelled' });
    for (let i = 0; i < 5; i += 1) {
      const calendar = await ensureRollingFridayCalendar(db, now);
      expect(calendar.created).not.toContain(evening.id);
      await runEveningShortfallChecks(db, now.getTime(), async () => { throw new Error('unexpected recruitment'); });
    }
    expect(await db.get<any>("SELECT COUNT(*) AS count FROM game_evenings WHERE substr(starts_at,1,10)='2026-08-28'")).toMatchObject({ count: 1 });
  });
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

    const monday1901Moscow = new Date('2026-08-24T16:01:00.000Z');
    const calls = { channel: [] as string[], dm: [] as string[], vk: [] as string[], drain: 0 };
    const delivery = {
      enqueueTelegramChannel: async (runtimeDb: DatabaseWrapper, eveningId: string) => {
        calls.channel.push(eveningId);
        const stamp = monday1901Moscow.toISOString();
        await runtimeDb.run(
          `INSERT OR REPLACE INTO evening_telegram_publications
            (evening_id, destination_id, chat_id, topic_id, message_id, sent_at, updated_at)
           VALUES (?, 'club', '-1001628595679', 5912, 77, ?, ?)`,
          [eveningId, stamp, stamp],
        );
      },
      enqueueTelegramDm: async (_db: DatabaseWrapper, eveningId: string) => { calls.dm.push(eveningId); },
      drainTelegram: async () => { calls.drain += 1; return { failed: 0 }; },
      syncVk: async (_db: DatabaseWrapper, eveningId: string) => { calls.vk.push(eveningId); },
    };

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

  it('does not repeat a completed weekly run when the Telegram publication record is missing', async () => {
    const db = createDb();
    await ensureRollingFridayCalendar(db, new Date('2026-08-22T10:00:00.000Z'));
    await ensureWeeklyEveningAutomationSchema(db);
    const target = await db.get<any>("SELECT id FROM game_evenings WHERE substr(starts_at,1,10)='2026-08-28'");
    const now = new Date('2026-08-24T16:01:00.000Z');
    await db.run(
      `INSERT INTO club_weekly_automation_runs
        (automation_key, evening_id, kind, status, first_due_at, completed_at, last_error, created_at, updated_at)
       VALUES (?, ?, 'weekly_announcement', 'done', ?, ?, NULL, ?, ?)`,
      [`weekly-announcement:${target.id}`, target.id, now.toISOString(), now.toISOString(), now.toISOString(), now.toISOString()],
    );
    await db.run(
      "UPDATE telegram_destinations SET chat_id='-100123', topic_id=5912, active=1 WHERE id='club'",
    );

    let channelCalls = 0;
    const result = await runDueWeeklyAnnouncements(db, {
      now,
      baseUrl: 'https://example.test',
      delivery: {
        enqueueTelegramChannel: async (runtimeDb, eveningId) => {
          channelCalls += 1;
          const stamp = now.toISOString();
          await runtimeDb.run(
            `INSERT INTO evening_telegram_publications
              (evening_id, destination_id, chat_id, topic_id, message_id, sent_at, updated_at)
             VALUES (?, 'club', '-100123', 5912, 77, ?, ?)`,
            [eveningId, stamp, stamp],
          );
        },
        enqueueTelegramDm: async () => {},
        drainTelegram: async () => ({ failed: 0 }),
        syncVk: async () => ({}),
      },
    });

    expect(channelCalls).toBe(0);
    expect(result).toMatchObject([{ evening_id: target.id, status: 'skipped' }]);
  });

  it('does not mark the weekly run done when Telegram delivery fails', async () => {
    const db = createDb();
    await ensureRollingFridayCalendar(db, new Date('2026-08-22T10:00:00.000Z'));
    await db.run("UPDATE telegram_destinations SET active=0 WHERE id='club'");
    const now = new Date('2026-08-24T16:01:00.000Z');

    const result = await runDueWeeklyAnnouncements(db, {
      now,
      baseUrl: 'https://example.test',
      delivery: {
        enqueueTelegramChannel: async () => {},
        enqueueTelegramDm: async () => {},
        drainTelegram: async () => ({ failed: 1 }),
        syncVk: async () => ({}),
      },
    });

    expect(result[0]?.status).toBe('error');
    const run = await db.get<any>('SELECT status, last_error FROM club_weekly_automation_runs LIMIT 1');
    expect(run?.status).toBe('error');
    expect(run?.last_error).toContain('Telegram delivery failed');
    const second = await runDueWeeklyAnnouncements(db, { now, baseUrl: 'https://example.test', delivery: {
      enqueueTelegramChannel: async () => { throw new Error('unexpected resend'); },
      enqueueTelegramDm: async () => {}, drainTelegram: async () => ({ failed: 0 }), syncVk: async () => ({}),
    } });
    expect(second[0]?.status).toBe('skipped');
  });

  it('never replaces a cancelled Friday on later calendar refreshes', async () => {
    const db = createDb();
    const now = new Date('2026-08-22T10:00:00.000Z');
    await ensureRollingFridayCalendar(db, now);
    await db.run("UPDATE game_evenings SET status='cancelled' WHERE substr(starts_at,1,10)='2026-08-28'");
    await ensureRollingFridayCalendar(db, now);
    await ensureRollingFridayCalendar(db, now);
    const rows = await db.all<any>("SELECT status FROM game_evenings WHERE substr(starts_at,1,10)='2026-08-28'");
    expect(rows).toEqual([{ status: 'cancelled' }]);
  });

  it('pauses calendar creation and all announcement delivery by default', async () => {
    process.env.WEEKLY_EVENING_AUTOMATION_ENABLED = 'false';
    const db = createDb();
    const result = await reconcileWeeklyEveningAutomation(db, { now: new Date('2026-08-24T16:01:00.000Z') });
    expect(result.paused).toBe(true);
    expect(await db.get<any>('SELECT COUNT(*) AS count FROM game_evenings')).toMatchObject({ count: 0 });
  });
});
