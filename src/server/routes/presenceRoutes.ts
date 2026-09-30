import express from 'express';
import rateLimit from 'express-rate-limit';
import { getPlayerSessionId, requireClubOwner, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { loadPresence, recordPresence } from '../services/presenceService.ts';

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Слишком часто' } }));

// The app reports its open screen; anonymous visitors are ignored.
router.post('/', async (req: AuthenticatedRequest, res) => {
  const playerId = getPlayerSessionId(req) || req.organizerPlayerId || null;
  if (playerId) recordPresence(req.db, playerId, req.body?.screen);
  return res.status(204).end();
});

// Only the club owner sees who is online and where.
router.get('/', requireOrganizerAuth, requireClubOwner, async (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ online: await loadPresence(req.db) });
});

export default router;
