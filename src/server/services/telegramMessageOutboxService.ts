import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureTelegramDirectMessageSchema } from '../../db/ensureTelegramDirectMessageSchema.ts';

export type TelegramMessageStatus = 'pending' | 'sent' | 'failed';

export interface TelegramMessageInput {
  messageKey: string;
  category: 'betting' | 'personal' | 'organizer';
  eventType: string;
  entityId?: string | number | null;
  playerId?: string | null;
  chatId: string | number;
  text: string;
  replyMarkup?: Record<string, unknown> | null;
}

export interface TelegramDeliveryDiagnostics {
  configured_recipient_count?: number;
  queue_size: number;
  latest_success: { message_key: string; sent_at: string; category: string; event_type: string } | null;
  latest_failure: { message_key: string; last_attempt_at: string | null; last_error: string; category: string; event_type: string } | null;
}

const MAX_RETRIES = 6;
const DEFAULT_CONCURRENCY = 4;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const WORKER_INTERVAL_MS = 5_000;
let workerTimer: ReturnType<typeof setInterval> | null = null;
let drainInFlight = false;
const messageKeysInFlight = new Set<string>();

const nowIso = () => new Date().toISOString();

const retryDelayMs = (retryCount: number, retryAfterSeconds?: number | null) => {
  if (retryAfterSeconds && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(MAX_BACKOFF_MS, Math.max(BASE_BACKOFF_MS, retryAfterSeconds * 1000));
  }
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (2 ** Math.max(0, retryCount - 1)));
};

export async function enqueueTelegramMessage(db: DatabaseWrapper, input: TelegramMessageInput) {
  await ensureTelegramDirectMessageSchema(db);
  const key = String(input.messageKey || '').trim();
  const chatId = String(input.chatId || '').trim();
  const text = String(input.text || '').trim();
  if (!key || !chatId || !text) throw new Error('Telegram outbox messageKey, chatId and text are required');
  const now = nowIso();
  await db.run(`
    INSERT INTO telegram_message_outbox
      (message_key, category, event_type, entity_id, player_id, chat_id, text, reply_markup_json,
       status, retry_count, next_attempt_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
    ON CONFLICT(message_key) DO UPDATE SET
      category = excluded.category,
      event_type = excluded.event_type,
      entity_id = excluded.entity_id,
      player_id = excluded.player_id,
      chat_id = excluded.chat_id,
      text = excluded.text,
      reply_markup_json = excluded.reply_markup_json,
      updated_at = excluded.updated_at
  `, [
    key,
    input.category,
    input.eventType,
    input.entityId == null ? null : String(input.entityId),
    input.playerId || null,
    chatId,
    text,
    input.replyMarkup ? JSON.stringify(input.replyMarkup) : null,
    now,
    now,
    now,
  ]);
  return db.get('SELECT * FROM telegram_message_outbox WHERE message_key = ?', [key]);
}

interface TelegramSendResult {
  ok: boolean;
  temporary?: boolean;
  error?: string;
  retryAfterSeconds?: number | null;
}

export async function sendTelegramMessage(
  row: any,
  fetchImpl: typeof fetch = fetch,
): Promise<TelegramSendResult> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { ok: false, temporary: true, error: 'TELEGRAM_BOT_TOKEN is not configured' };
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(row.chat_id),
        text: String(row.text),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(row.reply_markup_json ? { reply_markup: JSON.parse(String(row.reply_markup_json)) } : {}),
      }),
    });
    const payload: any = await response.json().catch(() => null);
    if (response.ok && payload?.ok !== false) return { ok: true };
    const error = String(payload?.description || `Telegram HTTP ${response.status}`);
    const retryAfterSeconds = Number(payload?.parameters?.retry_after || 0) || null;
    const temporary = response.status === 429 || response.status >= 500 || response.status === 408;
    return { ok: false, temporary, error, retryAfterSeconds };
  } catch (error: any) {
    return { ok: false, temporary: true, error: error?.message || String(error) };
  }
}

const refreshLegacyBettingNotificationState = async (db: DatabaseWrapper, poolId: string) => {
  const summary = await db.get<any>(`
    SELECT COUNT(*) AS sent_count, MAX(sent_at) AS latest_sent_at
      FROM telegram_message_outbox
     WHERE category = 'betting' AND entity_id = ? AND status = 'sent'
  `, [poolId]);
  const sentCount = Number(summary?.sent_count || 0);
  if (sentCount <= 0) return;
  const sentAt = String(summary?.latest_sent_at || nowIso());
  await db.run(`
    UPDATE betting_pools
       SET notification_count = ?, notified_at = COALESCE(notified_at, ?), updated_at = ?
     WHERE id = ?
  `, [sentCount, sentAt, sentAt, poolId]);
};

async function deliverOne(db: DatabaseWrapper, row: any, fetchImpl: typeof fetch) {
  const key = String(row.message_key);
  if (messageKeysInFlight.has(key)) return { sent: 0, failed: 0 };
  messageKeysInFlight.add(key);
  try {
    const current = await db.get<any>('SELECT status, retry_count FROM telegram_message_outbox WHERE message_key = ?', [key]);
    if (!current || current.status === 'sent' || Number(current.retry_count || 0) >= MAX_RETRIES) return { sent: 0, failed: 0 };
    const attemptAt = nowIso();
    const result = await sendTelegramMessage(row, fetchImpl);
    if (result.ok) {
      await db.run(`
        UPDATE telegram_message_outbox
           SET status = 'sent', last_attempt_at = ?, next_attempt_at = NULL,
               last_error = NULL, sent_at = ?, updated_at = ?
         WHERE message_key = ? AND status <> 'sent'
      `, [attemptAt, attemptAt, attemptAt, key]);
      if (row.category === 'betting' && row.entity_id) {
        await refreshLegacyBettingNotificationState(db, String(row.entity_id));
      }
      return { sent: 1, failed: 0 };
    }

    const failedAttempts = Number(current.retry_count || 0) + 1;
    const canRetry = Boolean(result.temporary) && failedAttempts < MAX_RETRIES;
    const storedRetryCount = canRetry ? failedAttempts : MAX_RETRIES;
    const nextAttemptAt = canRetry
      ? new Date(Date.now() + retryDelayMs(failedAttempts, result.retryAfterSeconds)).toISOString()
      : null;
    await db.run(`
      UPDATE telegram_message_outbox
         SET status = 'failed', retry_count = ?, last_attempt_at = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
       WHERE message_key = ? AND status <> 'sent'
    `, [storedRetryCount, attemptAt, nextAttemptAt, String(result.error || 'Telegram delivery failed').slice(0, 1000), attemptAt, key]);
    return { sent: 0, failed: 1 };
  } finally {
    messageKeysInFlight.delete(key);
  }
}

export async function drainTelegramMessageOutbox(
  db: DatabaseWrapper,
  options: { limit?: number; concurrency?: number; category?: string; entityId?: string | number; fetchImpl?: typeof fetch } = {},
) {
  await ensureTelegramDirectMessageSchema(db);
  const limit = Math.max(1, Math.min(100, Number(options.limit || 40)));
  const concurrency = Math.max(1, Math.min(10, Number(options.concurrency || process.env.TELEGRAM_OUTBOX_CONCURRENCY || DEFAULT_CONCURRENCY)));
  const clauses = [`status <> 'sent'`, `(next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now'))`, `retry_count < ?`];
  const params: any[] = [MAX_RETRIES];
  if (options.category) { clauses.push('category = ?'); params.push(options.category); }
  if (options.entityId != null) { clauses.push('entity_id = ?'); params.push(String(options.entityId)); }
  params.push(limit);
  const rows = await db.all<any>(`
    SELECT * FROM telegram_message_outbox
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at ASC
     LIMIT ?
  `, params);

  let sent = 0;
  let failed = 0;
  const fetchImpl = options.fetchImpl || fetch;
  for (let offset = 0; offset < rows.length; offset += concurrency) {
    const batch = rows.slice(offset, offset + concurrency);
    const results = await Promise.all(batch.map((row: any) => deliverOne(db, row, fetchImpl)));
    for (const result of results) { sent += result.sent; failed += result.failed; }
  }
  return { processed: rows.length, sent, failed };
}

export async function getTelegramMessageDiagnostics(db: DatabaseWrapper): Promise<TelegramDeliveryDiagnostics> {
  await ensureTelegramDirectMessageSchema(db);
  const queue = await db.get<any>(`SELECT COUNT(*) AS count FROM telegram_message_outbox WHERE status <> 'sent' AND retry_count < ?`, [MAX_RETRIES]);
  const latestSuccess = await db.get<any>(`
    SELECT message_key, sent_at, category, event_type FROM telegram_message_outbox
     WHERE status = 'sent' AND sent_at IS NOT NULL ORDER BY sent_at DESC LIMIT 1
  `);
  const latestFailure = await db.get<any>(`
    SELECT message_key, last_attempt_at, last_error, category, event_type FROM telegram_message_outbox
     WHERE status = 'failed' AND last_error IS NOT NULL ORDER BY last_attempt_at DESC LIMIT 1
  `);
  return {
    queue_size: Number(queue?.count || 0),
    latest_success: latestSuccess || null,
    latest_failure: latestFailure || null,
  };
}

export async function getTelegramEntityDeliverySummary(db: DatabaseWrapper, category: string, entityId: string | number) {
  await ensureTelegramDirectMessageSchema(db);
  const rows = await db.all<any>(`
    SELECT status, retry_count, last_error, sent_at, player_id, chat_id
      FROM telegram_message_outbox WHERE category = ? AND entity_id = ?
  `, [category, String(entityId)]);
  return {
    eligible: rows.length,
    pending: rows.filter((row: any) => row.status === 'pending').length,
    sent: rows.filter((row: any) => row.status === 'sent').length,
    failed: rows.filter((row: any) => row.status === 'failed').length,
    errors: rows.filter((row: any) => row.last_error).map((row: any) => ({ player_id: row.player_id, chat_id: row.chat_id, error: row.last_error })),
  };
}

export function kickTelegramMessageOutbox(db: DatabaseWrapper) {
  if (drainInFlight) return;
  drainInFlight = true;
  void drainTelegramMessageOutbox(db)
    .catch((error) => console.error('[TELEGRAM OUTBOX] Immediate drain failed:', error))
    .finally(() => { drainInFlight = false; });
}

export function startTelegramMessageOutboxWorker(db: DatabaseWrapper) {
  if (workerTimer) return;
  kickTelegramMessageOutbox(db);
  workerTimer = setInterval(() => kickTelegramMessageOutbox(db), WORKER_INTERVAL_MS);
  workerTimer.unref?.();
}
