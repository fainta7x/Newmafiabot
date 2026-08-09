import { Router } from 'express';
import { botServiceAuth } from '../botServiceAuth.ts';
import { loadPlayerAchievementProfile } from '../services/playerAchievementsService.ts';

const router = Router();
router.use(botServiceAuth);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mafia-webapp', api_version: '1' });
});

router.get('/players/:playerId/achievements', async (req, res) => {
  try {
    const db = (req as any).db;
    const player = await db.get('SELECT id, nickname, telegram_user_id FROM players WHERE id = ?', [req.params.playerId]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });
    const achievements = await loadPlayerAchievementProfile(db, String(player.id));
    res.json({ player, achievements });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить ачивки' });
  }
});

router.get('/players/by-telegram/:telegramUserId/achievements', async (req, res) => {
  try {
    const db = (req as any).db;
    const player = await db.get(
      'SELECT id, nickname, telegram_user_id FROM players WHERE telegram_user_id = ?',
      [String(req.params.telegramUserId)]
    );
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });
    const achievements = await loadPlayerAchievementProfile(db, String(player.id));
    res.json({ player, achievements });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить ачивки' });
  }
});

router.get('/players/by-telegram/:telegramUserId/tokens', async (req, res) => {
  try {
    const db = (req as any).db;
    const player = await db.get(
      'SELECT id, nickname, telegram_user_id, tokens FROM players WHERE telegram_user_id = ?',
      [String(req.params.telegramUserId)],
    );
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });
    res.json({
      player: { id: player.id, nickname: player.nickname, telegram_user_id: player.telegram_user_id },
      balance: player.tokens,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить баланс жетонов' });
  }
});

export default router;
