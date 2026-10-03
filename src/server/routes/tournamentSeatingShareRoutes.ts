import { Router, type Response } from 'express';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { decodeSeatingImage, sendSeatingImage, SeatingShareError, type SeatingShareTarget } from '../services/tournamentSeatingShareService.ts';

const router = Router();

// POST /api/tournaments/:id/seating-image { image: <PNG base64>, target: 'group' | 'me' }
router.post('/:id/seating-image', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const target: SeatingShareTarget = req.body?.target === 'group' ? 'group' : req.body?.target === 'me' ? 'me' : (() => { throw new SeatingShareError('Укажите, куда отправить'); })();
    const actorPlayerId = req.delegatedPlayerId || req.organizerPlayerId || null;
    const result = await sendSeatingImage(req.db, {
      tournamentId: String(req.params.id),
      target,
      image: decodeSeatingImage(req.body?.image),
      actorPlayerId,
    });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    const status = error instanceof SeatingShareError ? error.status : 500;
    return res.status(status).json({ error: error?.message || 'Не удалось отправить рассадку' });
  }
});

export default router;
