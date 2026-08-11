import { Router, Response } from 'express';
import {
  verifyOrganizerPassword,
  generateOrganizerToken,
  generatePlayerSessionToken,
  getPlayerSessionId,
  AuthenticatedRequest,
  checkLoginRateLimit,
  resetLoginRateLimit,
} from '../auth.ts';
import { TelegramInitDataError, validateTelegramInitData } from '../telegramMiniAppAuth.ts';
import { PlayerRegistrationError, registerNewPlayer } from '../services/playerRegistrationService.ts';

const router = Router();

const toSafePlayer = (player: any) => ({
  id: player.id,
  nickname: player.nickname,
  full_name: player.full_name ?? null,
  telegram_username: player.telegram_username ?? null,
  elo: Number(player.elo || 0),
  tokens: Number(player.tokens || 0),
});

const setPlayerCookie = (res: Response, playerId: string) => {
  const token = generatePlayerSessionToken(playerId);
  res.cookie('player_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const validateTelegramRequest = (initData: unknown) => {
  if (typeof initData !== 'string' || !initData) {
    throw new TelegramInitDataError('Telegram init data is required.');
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken) {
    throw new TelegramInitDataError('Telegram authentication is not configured.');
  }
  return validateTelegramInitData(initData, botToken);
};

router.post('/telegram', async (req, res) => {
  try {
    const telegram = validateTelegramRequest(req.body?.initData);
    const db = (req as any).db;
    const player = await db.get(
      `SELECT id, nickname, full_name, telegram_username, elo, tokens
       FROM players
       WHERE telegram_user_id = ?
       LIMIT 1`,
      [String(telegram.id)],
    );

    if (!player) {
      res.clearCookie('player_token', { path: '/' });
      return res.json({ ...telegram, linked: false });
    }

    setPlayerCookie(res, String(player.id));
    return res.json({ ...telegram, linked: true });
  } catch (error) {
    if (error instanceof TelegramInitDataError) {
      const status = error.message === 'Telegram authentication is not configured.' ? 503 : 401;
      return res.status(status).json({ error: error.message });
    }
    return res.status(401).json({ error: 'Invalid Telegram init data.' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const telegram = validateTelegramRequest(req.body?.initData);
    const db = (req as any).db;
    const result = await registerNewPlayer(db, {
      telegramUserId: telegram.id,
      telegramUsername: telegram.username,
      fullName: telegram.first_name,
      nickname: String(req.body?.nickname ?? ''),
      source: 'telegram_webapp_registration',
    });
    setPlayerCookie(res, result.player.id);
    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      player: toSafePlayer(result.player),
    });
  } catch (error: any) {
    if (error instanceof PlayerRegistrationError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    if (error instanceof TelegramInitDataError) {
      const status = error.message === 'Telegram authentication is not configured.' ? 503 : 401;
      return res.status(status).json({ error: error.message });
    }
    return res.status(500).json({ error: error?.message || 'Не удалось создать профиль игрока' });
  }
});

router.post('/login', (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  if (!checkLoginRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'Слишком много попыток входа. Попробуйте снова через 15 минут.',
    });
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Пароль не указан' });
  }

  if (verifyOrganizerPassword(password)) {
    resetLoginRateLimit(clientIp);
    const token = generateOrganizerToken();

    res.cookie('organizer_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      role: 'ORGANIZER',
      token,
      message: 'Успешная авторизация организатора',
    });
  }

  return res.status(401).json({ error: 'Неверный пароль организатора' });
});

router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  const playerId = getPlayerSessionId(req);
  let player = null;

  if (playerId) {
    const db = (req as any).db;
    const linkedPlayer = await db.get(
      `SELECT id, nickname, full_name, telegram_username, elo, tokens
       FROM players
       WHERE id = ?
       LIMIT 1`,
      [playerId],
    );
    if (linkedPlayer) {
      player = toSafePlayer(linkedPlayer);
    } else {
      res.clearCookie('player_token', { path: '/' });
    }
  }

  return res.json({
    role: req.userRole || 'PLAYER',
    isOrganizer: req.userRole === 'ORGANIZER',
    linked: Boolean(player),
    player,
  });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('organizer_token', { path: '/' });
  return res.json({ success: true, role: 'PLAYER' });
});

export default router;
