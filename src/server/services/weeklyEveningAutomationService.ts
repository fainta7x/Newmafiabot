import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureWeeklyEveningAutomationSchema } from '../../db/ensureWeeklyEveningAutomationSchema.ts';
import { ensureTelegramPublishingSchema } from '../../db/ensureTelegramPublishingSchema.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { ensureSlotsForEvening, SLOT_PRICE } from './eveningSlotPlanningService.ts';
import { ensureEveningCloseoutTask } from './eveningCloseoutService.ts';
import {
  drainTelegramSyncOutbox,
  enqueueTelegramAnnouncement,
  enqueueTelegramEveningSync,
} from './telegramSyncOutboxService.ts';
import { syncDirectVkEveningPublications } from './vkDirectJoinPublishingService.ts';
import { hydrateVkOAuthAccessToken } from './vkOAuthService.ts';
import { getPublicAppBaseUrl } from '../runtimeConfig.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 35;
const STALE_RUN_MS = 30 * 60 * 1000;

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

type DeliveryAdapters = {
  enqueueTelegramChannel: (db: DatabaseWrapper, eveningId: string) => Promise<void>;
  enqueueTelegramDm: (db: DatabaseWrapper, eveningId: string) => Promise<void>;
  drainTelegram: (db: DatabaseWrapper) => Promise<unknown>;
  syncVk: (db: DatabaseWrapper, eveningId: string, baseUrl: string) => Promise<unknown>;
};

const defaultDelivery: DeliveryAdapters = {
  enqueueTelegramChannel: enqueueTelegramEveningSync,
  enqueueTelegramDm: enqueueTelegramAnnouncement,
  drainTelegram: (db) => drainTelegramSyncOutbox(db, { limit: 50 }),
  syncVk: async (db, eveningId, baseUrl) => {
    await ensureVkIntegrationSchema(db);
    await hydrateVkOAuthAccessToken(db);
    const result = await syncDirectVkEveningPublications(db, eveningId, baseUrl);
    const failures = result.results.filter((item) => !item.success && !item.skipped);
    if (failures.length) {
      throw new Error(failures.map((item) => item.error || item.destination).join('; '));
    }
    return result;
  },
};


const civilDate = (now: Date) => {
  const shifted = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
};

const dateKey = (date: Date) => [
  date.getUTCFullYear(),
  String(date.getUTCMonth() + 1).padStart(2, '0'),
  String(date.getUTCDate()).padStart(2, '0'),
].join('-');

const addCivilDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

const fridayStartsAt = (date: Date) => `${dateKey(date)}T20:00:00+03:00`;
const fridayEndsAt = (date: Date) => `${dateKey(addCivilDays(date, 1))}T02:00:00+03:00`;
const titleForFriday = (date: Date) => `Игровой вечер — ${date.getUTCDate()} ${MONTHS_RU[date.getUTCMonth()]}`;

const findEveningForCivilDate = (db: DatabaseWrapper, key: string) => db.get<any>(
  `SELECT * FROM game_evenings
    WHERE substr(starts_at, 1, 10) = ?
      AND status != 'cancelled'
    ORDER BY created_at ASC
    LIMIT 1`,
  [key],
);

async function createPublishedFridayEvening(db: DatabaseWrapper, date: Date) {
  const key = dateKey(date);
  const existing = await findEveningForCivilDate(db, key);
  if (existing) {
    if (String(existing.status) === 'draft') {
      const updatedAt = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx.run(
          `UPDATE game_evenings
              SET status='published', updated_at=?
            WHERE id=? AND status='draft'`,
          [updatedAt, existing.id],
        );
        await tx.run('DELETE FROM telegram_sync_outbox WHERE sync_key = ?', [`evening:${existing.id}`]);
      });
    }
    await ensureSlotsForEvening(db, String(existing.id));
    return {
      evening: await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [existing.id]),
      created: false,
    };
  }

  const template = await db.get<any>(`
    SELECT venue, capacity, timezone
      FROM game_evenings
     WHERE status != 'cancelled'
     ORDER BY starts_at DESC
     LIMIT 1
  `);
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO game_evenings (
         id, title, starts_at, ends_at, timezone, venue, format, status,
         capacity, default_price, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'CASUAL', 'published', ?, ?, NULL, ?, ?)`,
      [
        id,
        titleForFriday(date),
        fridayStartsAt(date),
        fridayEndsAt(date),
        template?.timezone || 'Europe/Moscow',
        template?.venue || 'Суп с Котом',
        Number(template?.capacity || 20),
        SLOT_PRICE,
        now,
        now,
      ],
    );
    await tx.run('DELETE FROM telegram_sync_outbox WHERE sync_key = ?', [`evening:${id}`]);
  });

  await ensureSlotsForEvening(db, id);
  return { evening: await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [id]), created: true };
}

export async function ensureRollingFridayCalendar(db: DatabaseWrapper, now: Date = new Date()) {
  await ensureTelegramPublishingSchema(db);
  const start = civilDate(now);
  const created: string[] = [];
  const existing: string[] = [];

  for (let offset = 0; offset <= HORIZON_DAYS; offset += 1) {
    const date = addCivilDays(start, offset);
    if (date.getUTCDay() !== 5) continue;
    const result = await createPublishedFridayEvening(db, date);
    const eveningId = String(result.evening.id);
    await ensureEveningCloseoutTask(db, eveningId);
    (result.created ? created : existing).push(eveningId);
  }

  return { created, existing, horizon_days: HORIZON_DAYS };
}

async function acquireRun(db: DatabaseWrapper, key: string, eveningId: string, dueAt: string, now: Date) {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - STALE_RUN_MS).toISOString();
  const result = await db.run(`
    INSERT INTO club_weekly_automation_runs (
      automation_key, evening_id, kind, status, first_due_at, completed_at,
      last_error, created_at, updated_at
    ) VALUES (?, ?, 'weekly_announcement', 'running', ?, NULL, NULL, ?, ?)
    ON CONFLICT(automation_key) DO UPDATE SET
      status='running', last_error=NULL, updated_at=excluded.updated_at
    WHERE club_weekly_automation_runs.status != 'done'
      AND (
        club_weekly_automation_runs.status != 'running'
        OR club_weekly_automation_runs.updated_at < ?
      )
  `, [key, eveningId, dueAt, nowIso, nowIso, staleBefore]);
  return result.changes > 0;
}

async function finishRun(db: DatabaseWrapper, key: string, now: Date, error?: unknown) {
  const nowIso = now.toISOString();
  if (error) {
    await db.run(
      `UPDATE club_weekly_automation_runs
          SET status='error', last_error=?, updated_at=?
        WHERE automation_key=?`,
      [error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000), nowIso, key],
    );
    return;
  }
  await db.run(
    `UPDATE club_weekly_automation_runs
        SET status='done', completed_at=?, last_error=NULL, updated_at=?
      WHERE automation_key=?`,
    [nowIso, nowIso, key],
  );
}

export async function runDueWeeklyAnnouncements(
  db: DatabaseWrapper,
  options: { now?: Date; baseUrl?: string; delivery?: Partial<DeliveryAdapters> } = {},
) {
  await ensureWeeklyEveningAutomationSchema(db);
  await ensureTelegramPublishingSchema(db);

  const now = options.now || new Date();
  const nowMs = now.getTime();
  const baseUrl = String(options.baseUrl || getPublicAppBaseUrl()).replace(/\/+$/, '');
  const delivery: DeliveryAdapters = { ...defaultDelivery, ...(options.delivery || {}) };
  const rows = await db.all<any>(`
    SELECT id, title, starts_at, status, settled_at
      FROM game_evenings
     WHERE status IN ('published', 'active')
       AND settled_at IS NULL
     ORDER BY starts_at ASC
  `);

  const results: Array<{ evening_id: string; status: 'done' | 'skipped' | 'error'; error?: string }> = [];
  for (const evening of rows) {
    const startMs = new Date(String(evening.starts_at)).getTime();
    if (!Number.isFinite(startMs) || startMs <= nowMs) continue;
    const dueMs = startMs - (4 * DAY_MS + 60 * 60 * 1000);
    if (nowMs < dueMs) continue;

    const key = `weekly-announcement:${String(evening.id)}`;
    const acquired = await acquireRun(db, key, String(evening.id), new Date(dueMs).toISOString(), now);
    if (!acquired) {
      results.push({ evening_id: String(evening.id), status: 'skipped' });
      continue;
    }

    try {
      await delivery.enqueueTelegramChannel(db, String(evening.id));
      await delivery.enqueueTelegramDm(db, String(evening.id));
      await delivery.drainTelegram(db);
      await delivery.syncVk(db, String(evening.id), baseUrl);
      await finishRun(db, key, now);
      results.push({ evening_id: String(evening.id), status: 'done' });
    } catch (error) {
      await finishRun(db, key, now, error);
      results.push({ evening_id: String(evening.id), status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }

  return results;
}

export async function reconcileWeeklyEveningAutomation(
  db: DatabaseWrapper,
  options: { now?: Date; baseUrl?: string; delivery?: Partial<DeliveryAdapters> } = {},
) {
  const now = options.now || new Date();
  const calendar = await ensureRollingFridayCalendar(db, now);
  const announcements = await runDueWeeklyAnnouncements(db, { ...options, now });
  return { success: announcements.every((item) => item.status !== 'error'), calendar, announcements };
}
