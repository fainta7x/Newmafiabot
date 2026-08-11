import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { getTelegramSyncOutboxSummary } from '../services/telegramSyncOutboxService.ts';

const router = Router();
const DEFAULT_BOT_SERVICE_URL = 'https://mafiabot-0vcb.onrender.com';

router.get('/', requireOrganizerAuth, async (req, res) => {
  const checkedAt = new Date().toISOString();
  const db = (req as any).db as DatabaseWrapper;

  let database = { ok: false, latency_ms: null as number | null, error: null as string | null };
  const dbStarted = Date.now();
  try {
    await db.get('SELECT 1 AS ok');
    database = { ok: true, latency_ms: Date.now() - dbStarted, error: null };
  } catch (error: any) {
    database = { ok: false, latency_ms: Date.now() - dbStarted, error: error?.message || 'Database unavailable' };
  }

  let telegram = { ok: false, configured: 0, active: 0, total: 4, error: null as string | null };
  try {
    const rows = await db.all<any>('SELECT id, chat_id, active FROM telegram_destinations');
    const configured = rows.filter((row: any) => String(row.chat_id || '').trim()).length;
    const active = rows.filter((row: any) => Number(row.active || 0) === 1).length;
    telegram = { ok: configured === 4 && active === 4, configured, active, total: 4, error: null };
  } catch (error: any) {
    telegram = { ok: false, configured: 0, active: 0, total: 4, error: error?.message || 'Telegram settings unavailable' };
  }

  let syncQueue = {
    ok: false,
    pending: 0,
    retrying: 0,
    last_attempt_at: null as string | null,
    next_attempt_at: null as string | null,
    last_error: null as string | null,
  };
  try {
    const summary = await getTelegramSyncOutboxSummary(db);
    const latestRetry = summary.retrying > 0
      ? await db.get<any>(
          `SELECT last_error, next_attempt_at
             FROM telegram_sync_outbox
            WHERE attempt_count > 0
            ORDER BY last_attempt_at DESC
            LIMIT 1`,
        )
      : null;
    syncQueue = {
      // A freshly queued job is normal; only jobs already waiting for a retry are degraded.
      ok: summary.retrying === 0,
      pending: summary.pending,
      retrying: summary.retrying,
      last_attempt_at: summary.lastAttemptAt,
      next_attempt_at: latestRetry?.next_attempt_at || null,
      last_error: latestRetry?.last_error || null,
    };
  } catch (error: any) {
    syncQueue = {
      ok: false,
      pending: 0,
      retrying: 0,
      last_attempt_at: null,
      next_attempt_at: null,
      last_error: error?.message || 'Telegram sync queue unavailable',
    };
  }

  const botServiceUrl = String(process.env.BOT_SERVICE_URL || DEFAULT_BOT_SERVICE_URL).trim().replace(/\/+$/, '');
  let bot = { ok: false, latency_ms: null as number | null, error: null as string | null };
  const botStarted = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`${botServiceUrl}/health`, { signal: controller.signal });
    const text = await response.text().catch(() => '');
    bot = {
      ok: response.ok,
      latency_ms: Date.now() - botStarted,
      error: response.ok ? null : `HTTP ${response.status}${text ? ` · ${text.slice(0, 80)}` : ''}`,
    };
  } catch (error: any) {
    bot = {
      ok: false,
      latency_ms: Date.now() - botStarted,
      error: error?.name === 'AbortError' ? 'Bot health timeout' : error?.message || 'Bot unavailable',
    };
  } finally {
    clearTimeout(timeout);
  }

  return res.json({
    checked_at: checkedAt,
    web: { ok: true },
    database,
    bot,
    telegram,
    sync_queue: syncQueue,
    overall_ok: database.ok && bot.ok && telegram.ok && syncQueue.ok,
  });
});

export default router;
