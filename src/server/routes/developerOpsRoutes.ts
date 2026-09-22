import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getBotServiceBaseUrl } from '../runtimeConfig.ts';
import { getTelegramSyncOutboxSummary, drainTelegramSyncOutbox, enqueueTelegramEveningSync } from '../services/telegramSyncOutboxService.ts';
import { reconcileWeeklyEveningAutomation } from '../services/weeklyEveningAutomationService.ts';

const router = Router();

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireDeveloperOpsAccess(req: Request, res: Response, next: NextFunction) {
  const configured = String(process.env.DEVELOPER_OPS_KEY || '').trim();
  const supplied = String(req.header('X-Developer-Ops-Key') || '').trim();
  if (!configured) return res.status(503).json({ error: 'Developer operations access is not configured' });
  if (!supplied || !safeEqual(configured, supplied)) {
    return res.status(401).json({ error: 'Invalid developer operations credential' });
  }
  return next();
}

function requireDeveloperReadAccess(req: Request, res: Response, next: NextFunction) {
  const configured = String(process.env.DEVELOPER_READ_KEY || '').trim();
  const supplied = String(req.header('X-Developer-Read-Key') || '').trim();
  if (!configured) return res.status(503).json({ error: 'Developer read access is not configured' });
  if (!supplied || !safeEqual(configured, supplied)) {
    return res.status(401).json({ error: 'Invalid developer read credential' });
  }
  return next();
}

async function botHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  const started = Date.now();
  try {
    const response = await fetch(`${getBotServiceBaseUrl()}/health`, { signal: controller.signal });
    return { ok: response.ok, status: response.status, latency_ms: Date.now() - started };
  } catch (error: any) {
    return { ok: false, status: null, latency_ms: Date.now() - started, error: error?.name === 'AbortError' ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}

router.use(requireDeveloperReadAccess);

router.get('/status', async (req, res) => {
  const db = req.db as DatabaseWrapper;
  const checkedAt = new Date().toISOString();
  const checks: Record<string, unknown> = {};
  try {
    const started = Date.now();
    await db.get('SELECT 1 AS ok');
    checks.database = { ok: true, latency_ms: Date.now() - started };
  } catch (error: any) {
    checks.database = { ok: false, error: error?.message || 'unavailable' };
  }
  try {
    const rows = await db.all<any>('SELECT id, name, active, chat_id FROM telegram_destinations ORDER BY id');
    checks.telegram_destinations = rows.map((row) => ({
      id: row.id,
      name: row.name,
      active: Number(row.active || 0) === 1,
      configured: Boolean(String(row.chat_id || '').trim()),
    }));
  } catch (error: any) {
    checks.telegram_destinations = { error: error?.message || 'unavailable' };
  }
  try {
    checks.telegram_outbox = await getTelegramSyncOutboxSummary(db);
  } catch (error: any) {
    checks.telegram_outbox = { error: error?.message || 'unavailable' };
  }
  try {
    checks.weekly_runs = await db.all<any>(
      `SELECT automation_key, evening_id, kind, status, first_due_at, completed_at, last_error, updated_at
         FROM club_weekly_automation_runs
        ORDER BY updated_at DESC LIMIT 10`,
    );
  } catch (error: any) {
    checks.weekly_runs = { error: error?.message || 'unavailable' };
  }
  checks.bot = await botHealth();
  return res.json({ checked_at: checkedAt, environment: process.env.NODE_ENV || 'development', checks });
});

router.use(requireDeveloperOpsAccess);

router.post('/actions/reconcile-weekly', async (req, res) => {
  try {
    const result = await reconcileWeeklyEveningAutomation(req.db as DatabaseWrapper);
    return res.json({ ok: result.success, result });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || 'Weekly reconcile failed' });
  }
});

router.post('/actions/sync-evening/:eveningId', async (req, res) => {
  const eveningId = String(req.params.eveningId || '').trim();
  if (!eveningId) return res.status(400).json({ ok: false, error: 'eveningId is required' });
  try {
    const db = req.db as DatabaseWrapper;
    const evening = await db.get('SELECT id FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
    if (!evening) return res.status(404).json({ ok: false, error: 'Evening not found' });
    await enqueueTelegramEveningSync(db, eveningId);
    const result = await drainTelegramSyncOutbox(db, { limit: 10, allowEveningCreateOutsideWindow: true });
    return res.json({ ok: result.failed === 0, evening_id: eveningId, result });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || 'Evening sync failed' });
  }
});

export default router;
