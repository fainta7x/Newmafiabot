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
import {
  grantOrganizerPlayerAccess,
  hasOrganizerPlayerAccess,
  resolveVerifiedPlayerIdentity,
} from '../services/organizerPlayerAccessService.ts';

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

const setOrganizerCookie = (res: Response) => {
  const token = generateOrganizerToken();
  res.cookie('organizer_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
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
    const db = req.db;
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
    const db = req.db;
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

router.post('/login', async (req, res) => {
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

    // A correct organizer password may bind only the identity that the server
    // has already verified through the signed player cookie or VK join session.
    // Client-supplied player / Telegram / VK IDs are never trusted here.
    const identity = await resolveVerifiedPlayerIdentity(req.db, req);
    if (identity) await grantOrganizerPlayerAccess(req.db, identity);

    const token = setOrganizerCookie(res);
    return res.json({
      success: true,
      role: 'ORGANIZER',
      token,
      organizerAccountLinked: Boolean(identity),
      message: identity
        ? 'Успешная авторизация. Аккаунт привязан к доступу организатора.'
        : 'Успешная авторизация организатора',
    });
  }

  return res.status(401).json({ error: 'Неверный пароль организатора' });
});

const E2E_PROFILE_IDS = {
  player: 'e2e-player',
  organizer: 'e2e-organizer',
} as const;

function e2eProfilesEnabled(): boolean {
  return process.env.NODE_ENV === 'test'
    && process.env.PLAYWRIGHT_E2E === '1'
    && process.env.E2E_TEST_MODE === '1';
}

router.post('/e2e/profile', async (req, res) => {
  if (!e2eProfilesEnabled()) return res.status(404).json({ error: 'Not found' });

  const role = String(req.body?.role || '').trim();
  if (role === 'organizer') {
    const token = setOrganizerCookie(res);
    return res.json({
      profile: 'organizer',
      role: 'ORGANIZER',
      displayName: '[TEST] Организатор',
      token,
      production_writes: false,
    });
  }

  if (role !== 'player') {
    return res.status(400).json({ error: 'Роль должна быть organizer или player' });
  }

  const now = new Date().toISOString();
  const existing = await req.db.get(
    'SELECT id, nickname, full_name, telegram_username, elo, tokens FROM players WHERE id = ? LIMIT 1',
    [E2E_PROFILE_IDS.player],
  );
  if (!existing) {
    await req.db.run(
      `INSERT INTO players
        (id, nickname, full_name, telegram_username, lifecycle_status, source, elo, tokens, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'normal', 'playwright-e2e', 1200, 100, ?, ?)`,
      [E2E_PROFILE_IDS.player, '[TEST] Игрок', 'Тестовый игрок', 'e2e_player', now, now],
    );
  }

  setPlayerCookie(res, E2E_PROFILE_IDS.player);
  return res.json({
    profile: 'player',
    role: 'PLAYER',
    displayName: '[TEST] Игрок',
    playerId: E2E_PROFILE_IDS.player,
    production_writes: false,
  });
});

router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db;
  const identity = await resolveVerifiedPlayerIdentity(db, req);
  let player = null;

  if (identity) {
    const linkedPlayer = await db.get(
      `SELECT id, nickname, full_name, telegram_username, elo, tokens
       FROM players
       WHERE id = ?
       LIMIT 1`,
      [identity.playerId],
    );
    if (linkedPlayer) player = toSafePlayer(linkedPlayer);
  } else if (getPlayerSessionId(req)) {
    // A signed player cookie pointed to a profile that no longer exists.
    res.clearCookie('player_token', { path: '/' });
  }

  let isOrganizer = req.userRole === 'ORGANIZER';
  let organizerAutoAuthorized = false;

  if (!isOrganizer && identity && await hasOrganizerPlayerAccess(db, identity.playerId)) {
    setOrganizerCookie(res);
    isOrganizer = true;
    organizerAutoAuthorized = true;
  }

  return res.json({
    role: isOrganizer ? 'ORGANIZER' : 'PLAYER',
    isOrganizer,
    linked: Boolean(player),
    player,
    organizerAutoAuthorized,
  });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('organizer_token', { path: '/' });
  return res.json({ success: true, role: 'PLAYER' });
});

export default router;
