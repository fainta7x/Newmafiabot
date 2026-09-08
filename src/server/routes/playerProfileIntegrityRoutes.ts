import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { loadProfileCompleteness } from '../services/playerProfileIntegrityService.ts';
import {
  listVerifiedAwards,
  submitAwardSuggestion,
  syncTrustedTournamentAwards,
} from '../services/playerVerifiedAwardsService.ts';

const router = Router();

const playerIdFor = (req: any, res: any) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return String(playerId);
};

router.get('/profile-completeness', async (req, res) => {
  const playerId = playerIdFor(req, res);
  if (!playerId) return;
  try {
    const completeness = await loadProfileCompleteness(req.db, playerId);
    if (!completeness) return res.status(404).json({ error: 'Игрок не найден' });
    return res.json({ completeness });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить заполненность профиля' });
  }
});

router.get('/verified-awards', async (req, res) => {
  const playerId = playerIdFor(req, res);
  if (!playerId) return;
  try {
    await syncTrustedTournamentAwards(req.db, playerId);
    return res.json({ awards: await listVerifiedAwards(req.db, playerId, false) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить награды' });
  }
});

router.get('/award-suggestions', async (req, res) => {
  const playerId = playerIdFor(req, res);
  if (!playerId) return;
  try {
    const suggestions = await req.db.all(
      'SELECT * FROM player_award_suggestions WHERE player_id = ? ORDER BY created_at DESC',
      [playerId],
    );
    return res.json({ suggestions });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить предложения' });
  }
});

router.post('/award-suggestions', async (req, res) => {
  const playerId = playerIdFor(req, res);
  if (!playerId) return;
  try {
    const suggestion = await submitAwardSuggestion(req.db, playerId, req.body || {});
    return res.status(201).json({ suggestion });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось отправить предложение' });
  }
});

export default router;
