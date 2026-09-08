import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import {
  loadPremiumProfileElo,
  loadPremiumProfileGames,
  loadPremiumProfileRoles,
  loadPremiumProfileSummary,
  type PremiumProfileRange,
} from '../services/premiumPlayerProfileService.ts';

const router = Router();

const requireViewer = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const canViewPlayer = async (db: any, playerId: string) => {
  const row = await db.get<any>('SELECT id, COALESCE(contact_status,lifecycle_status,\'normal\') AS status FROM players WHERE id=? LIMIT 1', [playerId]);
  if (!row) return { ok: false as const, status: 404, error: 'Игрок не найден' };
  return { ok: true as const, row };
};

router.get('/profiles/:playerId/summary', async (req, res) => {
  const viewerId = requireViewer(req, res);
  if (!viewerId) return;
  try {
    const playerId = String(req.params.playerId);
    const access = await canViewPlayer(req.db, playerId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    return res.json(await loadPremiumProfileSummary(req.db, playerId, viewerId, false));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить профиль' });
  }
});

router.get('/profiles/:playerId/games', async (req, res) => {
  const viewerId = requireViewer(req, res);
  if (!viewerId) return;
  try {
    const playerId = String(req.params.playerId);
    const access = await canViewPlayer(req.db, playerId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const result = await loadPremiumProfileGames(req.db, playerId, {
      role: typeof req.query.role === 'string' ? req.query.role : undefined,
      team: typeof req.query.team === 'string' ? req.query.team : undefined,
      result: typeof req.query.result === 'string' ? req.query.result : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
      limit: Number(req.query.limit || 15),
      offset: Number(req.query.offset || 0),
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить историю игр' });
  }
});

router.get('/profiles/:playerId/roles', async (req, res) => {
  const viewerId = requireViewer(req, res);
  if (!viewerId) return;
  try {
    const playerId = String(req.params.playerId);
    const access = await canViewPlayer(req.db, playerId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    return res.json(await loadPremiumProfileRoles(req.db, playerId));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить статистику ролей' });
  }
});

router.get('/profiles/:playerId/elo', async (req, res) => {
  const viewerId = requireViewer(req, res);
  if (!viewerId) return;
  try {
    const playerId = String(req.params.playerId);
    const access = await canViewPlayer(req.db, playerId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const requested = String(req.query.range || 'all');
    const range: PremiumProfileRange = requested === 'month' || requested === 'season' ? requested : 'all';
    return res.json(await loadPremiumProfileElo(req.db, playerId, range));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить историю Elo' });
  }
});

export default router;
