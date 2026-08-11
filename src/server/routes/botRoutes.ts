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

router.post('/players/link-telegram', async (req, res) => {
  try {
    const db = (req as any).db;
    const telegramUserId = String(req.body?.telegram_user_id ?? '').trim();
    const telegramUsernameRaw = String(req.body?.telegram_username ?? '').trim().replace(/^@/, '');
    const nickname = String(req.body?.nickname ?? '').trim();

    if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
      return res.status(400).json({ error: 'Некорректный telegram_user_id' });
    }
    if (!nickname) return res.status(400).json({ error: 'Игровой ник обязателен' });

    const alreadyLinked = await db.get(
      'SELECT id, nickname, telegram_user_id FROM players WHERE telegram_user_id = ? LIMIT 1',
      [telegramUserId],
    );
    if (alreadyLinked) {
      return res.json({
        success: true,
        already_linked: true,
        player: { id: alreadyLinked.id, nickname: alreadyLinked.nickname },
      });
    }

    const matches = await db.all(
      `SELECT id, nickname, telegram_user_id, telegram_username
         FROM players
        WHERE lower(trim(nickname)) = lower(trim(?))
        ORDER BY created_at ASC`,
      [nickname],
    );

    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(404).json({ error: 'Профиль с таким игровым ником не найден', code: 'profile_not_found' });
    }
    if (matches.length !== 1) {
      return res.status(409).json({ error: 'Найдено несколько профилей с таким ником', code: 'ambiguous_profile' });
    }

    const player = matches[0];
    const existingTelegramId = String(player.telegram_user_id ?? '').trim();
    if (existingTelegramId && existingTelegramId !== telegramUserId) {
      return res.status(409).json({ error: 'Этот профиль уже привязан к другому Telegram', code: 'already_claimed' });
    }

    const now = new Date().toISOString();
    await db.run(
      `UPDATE players
          SET telegram_user_id = ?,
              telegram_username = CASE WHEN ? <> '' THEN ? ELSE telegram_username END,
              updated_at = ?
        WHERE id = ?`,
      [telegramUserId, telegramUsernameRaw, telegramUsernameRaw, now, player.id],
    );

    return res.json({
      success: true,
      already_linked: false,
      player: { id: player.id, nickname: player.nickname },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось привязать Telegram к профилю' });
  }
});

router.get('/evenings/open', async (req, res) => {
  try {
    const db = (req as any).db;
    const evenings = await db.all(
      `SELECT
         e.id, e.title, e.starts_at, e.ends_at, e.timezone, e.venue,
         e.format, e.status, e.capacity, e.default_price, e.notes,
         (SELECT COUNT(*) FROM evening_participants ep
           WHERE ep.evening_id = e.id AND ep.response_status IN ('going', 'late')) AS attending_count,
         (SELECT COUNT(*) FROM evening_participants ep
           WHERE ep.evening_id = e.id AND ep.response_status = 'thinking') AS thinking_count,
         (SELECT COUNT(*) FROM evening_participants ep
           WHERE ep.evening_id = e.id AND ep.response_status = 'declined') AS declined_count
       FROM game_evenings e
       WHERE e.status IN ('published', 'active') AND e.settled_at IS NULL
       ORDER BY e.starts_at ASC`,
    );
    res.json(evenings);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить открытые вечера' });
  }
});

router.get('/evenings/:eveningId/participants', async (req, res) => {
  try {
    const db = (req as any).db;
    const evening = await db.get(
      `SELECT id, title, starts_at, venue, format, status, settled_at
       FROM game_evenings WHERE id = ?`,
      [req.params.eveningId],
    );
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });

    const participants = await db.all(
      `SELECT
         ep.id, ep.player_id, p.nickname, p.telegram_user_id,
         ep.response_status, ep.registration_status,
         ep.attendance_status, ep.arrival_status,
         ep.payment_status, ep.amount_due, ep.amount_paid,
         ep.registered_at, ep.confirmed_at, ep.updated_at
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
       WHERE ep.evening_id = ?
       ORDER BY ep.created_at ASC`,
      [req.params.eveningId],
    );

    res.json({ evening, participants });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить состав вечера' });
  }
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
