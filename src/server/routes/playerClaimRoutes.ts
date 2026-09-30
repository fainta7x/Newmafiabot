import { Router } from 'express';
import { completeClaimPlayerOnboarding } from '../services/playerOnboardingService.ts';
import { PLAYER_ONBOARDING_COOKIE, clearPlayerOnboardingCookie } from '../services/playerOnboardingCookie.ts';
import { previewPlayerClaimLink } from '../services/playerClaimLinkService.ts';
import { setPlayerCookie } from './authRoutes.ts';

/** «Ссылка для привязки» for the player (owner, 2026-09-30); mounted at /api/auth next to the sign-in routes. */
const router = Router();

// «Ссылка для привязки»: whose profile a personal link opens (shown before sign-in).
router.get('/claim/:code', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    return res.json(await previewPlayerClaimLink(req.db, req.params.code));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 400)).json({ error: String(error?.message || 'Ссылка недоступна'), code: String(error?.code || 'claim_invalid') });
  }
});

router.post('/onboarding/claim', async (req, res) => {
  try {
    const rawToken = String(req.cookies?.[PLAYER_ONBOARDING_COOKIE] || '');
    const result = await completeClaimPlayerOnboarding(req.db, rawToken, req.body?.code);
    setPlayerCookie(res, result.playerId);
    clearPlayerOnboardingCookie(res);
    return res.json({ success: true, status: 'linked', nickname: result.nickname, return_to: result.returnTo });
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 400)).json({
      error: String(error?.message || 'Не удалось привязать профиль'),
      code: String(error?.code || 'claim_failed'),
    });
  }
});

export default router;
