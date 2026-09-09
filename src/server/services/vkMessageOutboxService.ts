import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkPersonalMessageSchema } from '../../db/ensureVkPersonalMessageSchema.ts';

export type VkMessageStatus = 'pending' | 'sent' | 'failed';
export type VkFailureKind = 'permission_denied' | 'temporary' | 'permanent' | 'configuration' | null;

export interface VkMessageInput {
  messageKey: string;
  notificationKey: string;
  category: 'personal';
  eventType: string;
  entityId?: string | number | null;
  playerId?: string | null;
  vkUserId: string | number;
  text: string;
  actionPath?: string | null;
}

const MAX_RETRIES = 6;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const WORKER_INTERVAL_MS = 5_000;
let workerTimer: ReturnType<typeof setInterval> | null = null;
let drainInFlight = false;
const keysInFlight = new Set<string>();

const nowIso = () => new Date().toISOString();
const stableRandomId = (messageKey: string) => {
  const digest = crypto.createHash('sha256').update(messageKey).digest();
  return Math.max(1, digest.readUInt32BE(0) & 0x7fffffff);
};
const retryDelayMs = (attempt: number) => Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (2 ** Math.max(0, attempt - 1)));
const playerAppBaseUrl = () => String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');

export async function enqueueVkMessage(db: DatabaseWrapper, input: VkMessageInput) {
  await ensureVkPersonalMessageSchema(db);
  const key = String(input.messageKey || '').trim();
  const notificationKey = String(input.notificationKey || '').trim();
  const vkUserId = String(input.vkUserId || '').trim();
  const text = String(input.text || '').trim();
  if (!key || !notificationKey || !/^\d+$/.test(vkUserId) || !text) throw new Error('VK outbox messageKey, notificationKey, vkUserId and text are required');
  const now = nowIso();
  await db.run(`
    INSERT INTO vk_message_outbox (
      message_key, notification_key, category, event_type, entity_id, player_id, vk_user_id, text, action_path,
      random_id, status, retry_count, next_attempt_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
    ON CONFLICT(message_key) DO UPDATE SET
      notification_key = excluded.notification_key,
      category = excluded.category,
      event_type = excluded.event_type,
      entity_id = excluded.entity_id,
      player_id = excluded.player_id,
      vk_user_id = excluded.vk_user_id,
      text = excluded.text,
      action_path = excluded.action_path,
      updated_at = excluded.updated_at
  `, [
    key, notificationKey, input.category, input.eventType, input.entityId == null ? null : String(input.entityId),
    input.playerId || null, vkUserId, text, input.actionPath || null, stableRandomId(key), now, now, now,
  ]);
  return db.get('SELECT * FROM vk_message_outbox WHERE message_key = ?', [key]);
}

type VkSendResult = { ok: boolean; temporary?: boolean; permissionDenied?: boolean; error?: string };

export async function sendVkCommunityMessage(row: any, fetchImpl: typeof fetch = fetch): Promise<VkSendResult> {
  const token = String(process.env.VK_GROUP_ACCESS_TOKEN || '').trim();
  if (!token) return { ok: false, temporary: true, error: 'VK_GROUP_ACCESS_TOKEN is not configured' };
  const body = new URLSearchParams({
    access_token: token,
    v: String(process.env.VK_API_VERSION || '5.199').trim() || '5.199',
    user_id: String(row.vk_user_id),
    random_id: String(row.random_id),
    message: String(row.text),
  });
  const baseUrl = playerAppBaseUrl();
  if (baseUrl && row.action_path) {
    const actionPath = String(row.action_path).startsWith('/player') ? String(row.action_path) : '/player';
    body.set('message', `${String(row.text)}\n\n${baseUrl}${actionPath}`);
  }

  try {
    const response = await fetchImpl('https://api.vk.com/method/messages.send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
    });
    const payload: any = await response.json().catch(() => ({}));
    if (response.ok && payload?.response !== undefined && !payload?.error) return { ok: true };
    const code = Number(payload?.error?.error_code || 0);
    const permissionDenied = code === 901 || code === 902;
    const temporary = response.status === 429 || response.status >= 500 || [6, 9, 10, 29].includes(code);
    return {
      ok: false,
      permissionDenied,
      temporary: !permissionDenied && temporary,
      error: `VK API ${code || response.status || 'error'}: ${String(payload?.error?.error_msg || 'delivery failed')}`.slice(0, 1000),
    };
  } catch (error: any) {
    return { ok: false, temporary: true, error: String(error?.message || error).slice(0, 1000) };
  }
}

async function deliverOne(db: DatabaseWrapper, row: any, fetchImpl: typeof fetch) {
  const key = String(row.message_key);
  if (keysInFlight.has(key)) return { sent: 0, failed: 0 };
  keysInFlight.add(key);
  try {
    const current = await db.get<any>('SELECT status, retry_count FROM vk_message_outbox WHERE message_key = ?', [key]);
    if (!current || current.status === 'sent' || Number(current.retry_count || 0) >= MAX_RETRIES) return { sent: 0, failed: 0 };
    const attemptAt = nowIso();
    const result = await sendVkCommunityMessage(row, fetchImpl);
    if (result.ok) {
      await db.run(`
        UPDATE vk_message_outbox
           SET status='sent', last_attempt_at=?, next_attempt_at=NULL, last_error=NULL,
               failure_kind=NULL, sent_at=?, updated_at=?
         WHERE message_key=? AND status <> 'sent'
      `, [attemptAt, attemptAt, attemptAt, key]);
      await db.run(`
        UPDATE personal_notification_deliveries
           SET status='queued', reason=NULL, updated_at=?
         WHERE notification_key=? AND selected_channel='vk'
      `, [attemptAt, String(row.notification_key)]);
      return { sent: 1, failed: 0 };
    }

    const nextRetry = Number(current.retry_count || 0) + 1;
    const canRetry = Boolean(result.temporary) && nextRetry < MAX_RETRIES;
    const storedRetries = canRetry ? nextRetry : MAX_RETRIES;
    const nextAttemptAt = canRetry ? new Date(Date.now() + retryDelayMs(nextRetry)).toISOString() : null;
    const failureKind: Exclude<VkFailureKind, null> = result.permissionDenied
      ? 'permission_denied'
      : result.temporary ? 'temporary' : result.error?.includes('not configured') ? 'configuration' : 'permanent';
    await db.run(`
      UPDATE vk_message_outbox
         SET status='failed', retry_count=?, last_attempt_at=?, next_attempt_at=?, last_error=?, failure_kind=?, updated_at=?
       WHERE message_key=? AND status <> 'sent'
    `, [storedRetries, attemptAt, nextAttemptAt, result.error || 'VK delivery failed', failureKind, attemptAt, key]);
    await db.run(`
      UPDATE personal_notification_deliveries
         SET status='pending_channel', reason=?, updated_at=?
       WHERE notification_key=? AND selected_channel='vk'
    `, [failureKind, attemptAt, String(row.notification_key)]);
    return { sent: 0, failed: 1 };
  } finally {
    keysInFlight.delete(key);
  }
}

export async function drainVkMessageOutbox(
  db: DatabaseWrapper,
  options: { limit?: number; concurrency?: number; fetchImpl?: typeof fetch } = {},
) {
  await ensureVkPersonalMessageSchema(db);
  const limit = Math.max(1, Math.min(100, Number(options.limit || 40)));
  const concurrency = Math.max(1, Math.min(10, Number(options.concurrency || 4)));
  const rows = await db.all<any>(`
    SELECT * FROM vk_message_outbox
     WHERE status <> 'sent'
       AND retry_count < ?
       AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now'))
     ORDER BY created_at ASC
     LIMIT ?
  `, [MAX_RETRIES, limit]);
  let sent = 0;
  let failed = 0;
  for (let offset = 0; offset < rows.length; offset += concurrency) {
    const results = await Promise.all(rows.slice(offset, offset + concurrency).map((row: any) => deliverOne(db, row, options.fetchImpl || fetch)));
    for (const result of results) { sent += result.sent; failed += result.failed; }
  }
  return { processed: rows.length, sent, failed };
}

export async function getVkPersonalDeliveryStatus(db: DatabaseWrapper, playerId: string) {
  await ensureVkPersonalMessageSchema(db);
  const latestPermissionFailure = await db.get<any>(`
    SELECT updated_at
      FROM vk_message_outbox
     WHERE player_id=? AND failure_kind='permission_denied'
     ORDER BY datetime(updated_at) DESC LIMIT 1
  `, [playerId]);
  return {
    permission_granted: !latestPermissionFailure,
    permission_problem: latestPermissionFailure ? {
      code: 'vk_messages_unavailable',
      message: 'Разрешите сообщения от сообщества 2LA Noire во ВКонтакте, чтобы получать личные уведомления.',
      detected_at: latestPermissionFailure.updated_at || null,
    } : null,
  };
}

export async function getVkPersonalDeliveryDiagnostics(db: DatabaseWrapper) {
  await ensureVkPersonalMessageSchema(db);
  const rows = await db.all<any>(`
    SELECT o.player_id, p.nickname, o.updated_at, o.last_error
      FROM vk_message_outbox o
 LEFT JOIN players p ON p.id=o.player_id
     WHERE o.failure_kind='permission_denied'
       AND o.status='failed'
     ORDER BY datetime(o.updated_at) DESC
     LIMIT 100
  `);
  return rows.map((row: any) => ({
    player_id: row.player_id || null,
    nickname: row.nickname || 'Игрок',
    status: 'permission_denied',
    detected_at: row.updated_at || null,
    error: row.last_error || null,
  }));
}

export function kickVkMessageOutbox(db: DatabaseWrapper) {
  if (drainInFlight) return;
  drainInFlight = true;
  void drainVkMessageOutbox(db)
    .catch((error) => console.error('[VK OUTBOX] Immediate drain failed:', error instanceof Error ? error.message : String(error)))
    .finally(() => { drainInFlight = false; });
}

export function startVkMessageOutboxWorker(db: DatabaseWrapper) {
  if (workerTimer) return;
  kickVkMessageOutbox(db);
  workerTimer = setInterval(() => kickVkMessageOutbox(db), WORKER_INTERVAL_MS);
  workerTimer.unref?.();
}
