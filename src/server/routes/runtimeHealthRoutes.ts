import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { checkRuntimeReadiness, type RuntimeReadiness } from '../services/runtimeReadinessService.ts';
import type { RuntimeFetch } from '../services/telegramRuntimeHealthService.ts';

export const createRuntimeHealthRoutes = (fetcher?: RuntimeFetch, cacheTtlMs = 30_000) => {
  const router = Router();
  let cached: { expiresAt: number; health: RuntimeReadiness } | null = null;
  let inFlight: Promise<RuntimeReadiness> | null = null;

  router.get('/runtime', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const now = Date.now();
      if (!cached || cached.expiresAt <= now) {
        inFlight ||= checkRuntimeReadiness(req.db as DatabaseWrapper, fetcher)
          .then((health) => {
            cached = { expiresAt: Date.now() + cacheTtlMs, health };
            return health;
          })
          .finally(() => { inFlight = null; });
      }
      const health = cached && cached.expiresAt > now ? cached.health : await inFlight!;
      return res.status(health.status === 'ok' ? 200 : 503).json(health);
    } catch {
      return res.status(503).json({
        status: 'degraded',
        checked_at: new Date().toISOString(),
        checks: { database: 'fail', bot: 'fail', telegram: 'fail' },
      });
    }
  });

  return router;
};

export default createRuntimeHealthRoutes();
