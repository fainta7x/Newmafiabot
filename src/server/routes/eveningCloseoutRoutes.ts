import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import {
  addEveningWalkIn,
  loadEveningCloseout,
  settleEveningFromCloseout,
} from '../services/eveningCloseoutService.ts';

const router = Router();

router.get('/:id/closeout', requireOrganizerAuth, async (req, res) => {
  try {
    return res.json(await loadEveningCloseout(req.db, String(req.params.id)));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({
      error: error?.message || 'Не удалось загрузить закрытие вечера',
      code: error?.code,
      details: error?.details,
    });
  }
});

router.post('/:id/closeout/walk-in', requireOrganizerAuth, async (req, res) => {
  try {
    return res.status(201).json(await addEveningWalkIn(req.db, String(req.params.id), req.body || {}));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 400)).json({
      error: error?.message || 'Не удалось добавить пришедшего игрока',
      code: error?.code,
    });
  }
});

router.post('/:id/closeout/settle', requireOrganizerAuth, async (req, res) => {
  try {
    return res.json(await settleEveningFromCloseout(req.db, String(req.params.id), {
      allow_missing_game_stats: Boolean(req.body?.allow_missing_game_stats),
    }));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({
      error: error?.message || 'Не удалось закрыть вечер',
      code: error?.code,
      details: error?.details,
    });
  }
});

export default router;
