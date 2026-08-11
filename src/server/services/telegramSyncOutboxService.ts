import type { DatabaseWrapper } from '../../db/index.ts';
import {
  requestBotEveningTelegramSync,
  requestBotPublicRouterSync,
} from './botTelegramSyncService.ts';

export type TelegramSyncJobKind = 'evening' | 'public_router';

export interface TelegramSyncJob {
  sync_key: string;
  kind: TelegramSyncJobKind;
  entity_id: string | null;
  version: number;
  attempt_count: number;
  requested_at: string;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  last_error: string | null;
}

type BotSyncResult = { success: boolean; status: number; data?: any; error?: string };
export type TelegramSyncDeliverer = (job: TelegramSyncJob) => Promise<BotSyncResult>;

const activeDrains = new WeakSet<object>();
const workerTimers = new WeakMap<object, ReturnType<typeof setInterval>>();
const DEFAULT_WORKER_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 8;

const retryDelayMs = (attemptNumber: number) =>
  Math.min(10 * 60_000, 15_000 * (2 ** Math.max(0, attemptNumber - 1)));

const defaultDeliverer: TelegramSyncDeliverer = async (job) => {
  if (job.kind === 'public_router') return requestBotPublicRouterSync();
  if (!job.entity_id) return { success: false, status: 400, error: 'В outbox отсутствует ID игрового вечера' };
  return requestBotEveningTelegramSync(job.entity_id);
};

export async function enqueueTelegramEveningSync(db: DatabaseWrapper, eveningId: string): Promise<void> {
  const id = String(eveningId || '').trim();
  if (!id) return;
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO telegram_sync_outbox
       (sync_key, kind, entity_id, version, attempt_count, requested_at, last_attempt_at, next_attempt_at, last_error)
     VALUES (?, 'evening', ?, 1, 0, ?, NULL, NULL, NULL)
     ON CONFLICT(sync_key) DO UPDATE SET
       entity_id = excluded.entity_id,
       version = telegram_sync_outbox.version + 1,
       attempt_count = 0,
       requested_at = excluded.requested_at,
       last_attempt_at = NULL,
       next_attempt_at = NULL,
       last_error = NULL`,
    [`evening:${id}`, id, now],
  );
}

export async function enqueueTelegramPublicRouterSync(db: DatabaseWrapper): Promise<void> {
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO telegram_sync_outbox
       (sync_key, kind, entity_id, version, attempt_count, requested_at, last_attempt_at, next_attempt_at, last_error)
     VALUES ('public-router', 'public_router', NULL, 1, 0, ?, NULL, NULL, NULL)
     ON CONFLICT(sync_key) DO UPDATE SET
       version = telegram_sync_outbox.version + 1,
       attempt_count = 0,
       requested_at = excluded.requested_at,
       last_attempt_at = NULL,
       next_attempt_at = NULL,
       last_error = NULL`,
    [now],
  );
}

export async function getTelegramSyncOutboxSummary(db: DatabaseWrapper) {
  const row = await db.get<any>(
    `SELECT COUNT(*) AS pending,
            COALESCE(SUM(CASE WHEN attempt_count > 0 THEN 1 ELSE 0 END), 0) AS retrying,
            MAX(last_attempt_at) AS last_attempt_at
       FROM telegram_sync_outbox`,
  );
  return {
    pending: Number(row?.pending || 0),
    retrying: Number(row?.retrying || 0),
    lastAttemptAt: row?.last_attempt_at || null,
  };
}

export async function drainTelegramSyncOutbox(
  db: DatabaseWrapper,
  options: { limit?: number; now?: Date; deliver?: TelegramSyncDeliverer } = {},
): Promise<{ processed: number; succeeded: number; failed: number; skipped: boolean }> {
  if (activeDrains.has(db as object)) return { processed: 0, succeeded: 0, failed: 0, skipped: true };
  activeDrains.add(db as object);

  const now = options.now || new Date();
  const nowIso = now.toISOString();
  const deliver = options.deliver || defaultDeliverer;
  const limit = Math.max(1, Math.min(50, Math.trunc(options.limit || DEFAULT_BATCH_SIZE)));
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const jobs = await db.all<TelegramSyncJob>(
      `SELECT sync_key, kind, entity_id, version, attempt_count, requested_at,
              last_attempt_at, next_attempt_at, last_error
         FROM telegram_sync_outbox
        WHERE next_attempt_at IS NULL OR next_attempt_at <= ?
        ORDER BY requested_at ASC
        LIMIT ?`,
      [nowIso, limit],
    );

    for (const job of jobs) {
      processed += 1;
      let result: BotSyncResult;
      try {
        result = await deliver(job);
      } catch (error: any) {
        result = { success: false, status: 502, error: error?.message || 'Не удалось выполнить Telegram-синхронизацию' };
      }

      if (result.success) {
        const deletion = await db.run(
          'DELETE FROM telegram_sync_outbox WHERE sync_key = ? AND version = ?',
          [job.sync_key, Number(job.version)],
        );
        if (deletion.changes > 0) succeeded += 1;
        continue;
      }

      const attemptNumber = Number(job.attempt_count || 0) + 1;
      const nextAttemptAt = new Date(now.getTime() + retryDelayMs(attemptNumber)).toISOString();
      const errorText = String(result.error || `Bot HTTP ${result.status || 502}`).slice(0, 1000);
      const update = await db.run(
        `UPDATE telegram_sync_outbox
            SET attempt_count = attempt_count + 1,
                last_attempt_at = ?,
                next_attempt_at = ?,
                last_error = ?
          WHERE sync_key = ? AND version = ?`,
        [nowIso, nextAttemptAt, errorText, job.sync_key, Number(job.version)],
      );
      if (update.changes > 0) failed += 1;
      console.warn('[TELEGRAM] Durable sync queued for retry:', job.sync_key, errorText);
    }

    return { processed, succeeded, failed, skipped: false };
  } finally {
    activeDrains.delete(db as object);
  }
}

export function startTelegramSyncOutboxWorker(
  db: DatabaseWrapper,
  options: { intervalMs?: number } = {},
): void {
  if (workerTimers.has(db as object)) return;
  const intervalMs = Math.max(5_000, Number(options.intervalMs || DEFAULT_WORKER_INTERVAL_MS));
  const run = () => {
    void drainTelegramSyncOutbox(db).catch((error) => {
      console.error('[TELEGRAM] Outbox worker failed:', error);
    });
  };
  run();
  const timer = setInterval(run, intervalMs);
  (timer as any).unref?.();
  workerTimers.set(db as object, timer);
}

export function stopTelegramSyncOutboxWorker(db: DatabaseWrapper): void {
  const timer = workerTimers.get(db as object);
  if (!timer) return;
  clearInterval(timer);
  workerTimers.delete(db as object);
}
