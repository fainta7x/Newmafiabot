import { Router, type Response } from 'express';
import type { AuthenticatedRequest } from '../auth.ts';
import { reconcileTournamentGameTokenSettlement } from '../services/tournamentGameTokenSettlementService.ts';

const router = Router();

router.use((req: AuthenticatedRequest, res: Response, next) => {
  if (req.method !== 'POST') return next();
  const match = req.path.match(/^\/([^/]+)\/games\/([^/]+)\/protocol\/(complete|revert-to-draft)\/?$/);
  if (!match) return next();

  const gameId = match[2];
  const action = match[3];
  const originalJson = res.json.bind(res);
  let intercepted = false;

  res.json = ((body: any) => {
    if (intercepted || res.statusCode >= 400) return originalJson(body);
    intercepted = true;
    const db = req.db;
    void (async () => {
      try {
        await reconcileTournamentGameTokenSettlement(db, gameId, {
          activateIfUntracked: action === 'complete',
          context: action === 'complete' ? 'completion' : 'reopen',
        });
        originalJson(body);
      } catch (error: any) {
        console.error('[TOKENS] Tournament game settlement failed:', error);
        if (!res.headersSent) res.status(500);
        originalJson({ error: error?.message || 'Не удалось пересчитать жетоны турнирной игры' });
      }
    })();
    return res;
  }) as typeof res.json;

  return next();
});

export default router;
