import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { botServiceAuth } from '../botServiceAuth.ts';
import { loadPlayerAchievementProfile } from '../services/playerAchievementsService.ts';
import { setParticipantResponse } from '../services/eveningParticipantState.ts';

const router = Router();
router.use(botServiceAuth);

const EVENING_RESPONSE_STATUSES = new Set(['going', 'late', 'thinking', 'declined']);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mafia-webapp', api_version: '1' });
});

router.post('/evenings/:eveningId/respond', async (req, res) => {
  try {
    const db = (req as any).db;
    const telegramUserId = String(req.body?.telegram_user_id ?? '').trim();
    const responseStatus = String(req.body?.response_status ?? '').trim();

    if (!telegramUserId) return res.status(400).json({ error: 'telegram_user_id обязателен' });
    if (!EVENING_RESPONSE_STATUSES.has(responseStatus)) {
      return res.status(400).json({ error: 'Недопустимый response_status' });
    }

    const player = await db.get(
      'SELECT id, nickname, telegram_user_id FROM players WHERE telegram_user_id = ?',
      [telegramUserId],
    );
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    const evening = await db.get(
      'SELECT id, status, settled_at, default_price FROM game_evenings WHERE id = ?',
      [req.params.eveningId],
    );
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });
    if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
      return res.status(409).json({ error: 'Ответы на этот вечер уже недоступны' });
    }

    const now = new Date().toISOString();
    const defaultPrice = Math.max(0, Number(evening.default_price || 0));
    const participantId = randomUUID();

    await db.run(
      `INSERT OR IGNORE INTO evening_participants (
        id, evening_id, player_id, response_status, registration_status,
        attendance_status, arrival_status, payment_status, amount_due, amount_paid,
        registered_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'unanswered', 'unanswered', 'pending', 'unknown', ?, ?, 0, ?, ?, ?)`,
      [
        participantId,
        evening.id,
        player.id,
        defaultPrice === 0 ? 'waived' : 'unpaid',
        defaultPrice,
        now,
        now,
        now,
      ],
    );

    const participant = await db.get(
      'SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ?',
      [evening.id, player.id],
    );
    if (!participant) return res.status(500).json({ error: 'Не удалось создать участника вечера' });

    await setParticipantResponse(db, String(participant.id), responseStatus as any);

    res.json({
      success: true,
      evening_id: evening.id,
      player: { id: player.id, nickname: player.nickname, telegram_user_id: player.telegram_user_id },
      response_status: responseStatus,
      registration_status: responseStatus,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить ответ на вечер' });
  }
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
