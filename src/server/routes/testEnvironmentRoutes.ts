import crypto from 'node:crypto';
import { Router } from 'express';
import { getIsolatedTestDb } from '../../db/index.ts';
import {
  checkLoginRateLimit,
  isTestEnvironmentRequest,
  resetLoginRateLimit,
  testEnvironmentPlayerId,
} from '../auth.ts';
import { PlayerRegistrationError, registerNewPlayer } from '../services/playerRegistrationService.ts';
import { setOrganizerCookie, setPlayerCookie } from './authRoutes.ts';

const router = Router();
const TEST_PLAYER_ID = 'p-test-1';

function testEnvironmentEnabled(): boolean {
  return String(process.env.TEST_ACCESS_PASSWORD || '').length >= 12;
}

function safePasswordMatch(actual: unknown): boolean {
  const expected = String(process.env.TEST_ACCESS_PASSWORD || '');
  const received = typeof actual === 'string' ? actual : '';
  if (!testEnvironmentEnabled() || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

router.get('/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    enabled: testEnvironmentEnabled(),
    active: isTestEnvironmentRequest(req),
    label: testEnvironmentEnabled() ? 'ТЕСТОВАЯ ВЕРСИЯ' : null,
  });
});

router.post('/login', async (req, res) => {
  if (!testEnvironmentEnabled()) return res.status(404).json({ error: 'Not found' });
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkLoginRateLimit(`test:${clientIp}`)) {
    return res.status(429).json({ error: 'Слишком много попыток. Попробуйте снова через 15 минут.' });
  }
  if (!safePasswordMatch(req.body?.password)) {
    return res.status(401).json({ error: 'Неверный пароль тестовой версии' });
  }

  const role = String(req.body?.role || '').trim();
  if (role !== 'player' && role !== 'organizer') {
    return res.status(400).json({ error: 'Выберите вход игрока или организатора' });
  }

  const testDb = await getIsolatedTestDb();
  const player = await testDb.get<{ id: string }>('SELECT id FROM players WHERE id = ? LIMIT 1', [TEST_PLAYER_ID]);
  if (!player) return res.status(503).json({ error: 'Тестовый игрок не создан' });

  resetLoginRateLimit(`test:${clientIp}`);
  setPlayerCookie(res, testEnvironmentPlayerId(TEST_PLAYER_ID));
  if (role === 'organizer') setOrganizerCookie(res);
  else res.clearCookie('organizer_token', { path: '/' });

  return res.json({
    success: true,
    role: role === 'organizer' ? 'ORGANIZER' : 'PLAYER',
    playerId: TEST_PLAYER_ID,
    redirectTo: role === 'organizer' ? '/admin' : '/player',
  });
});

router.post('/register', async (req, res) => {
  if (!testEnvironmentEnabled()) return res.status(404).json({ error: 'Not found' });
  if (!safePasswordMatch(req.body?.password)) {
    return res.status(401).json({ error: 'Неверный пароль тестовой версии' });
  }
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkLoginRateLimit(`test-register:${clientIp}`)) {
    return res.status(429).json({ error: 'Слишком много попыток. Попробуйте снова через 15 минут.' });
  }

  const nickname = String(req.body?.nickname || '').trim();
  const fullName = String(req.body?.fullName || '').trim() || null;
  if (!nickname) return res.status(400).json({ error: 'Введите игровой ник' });

  try {
    const testDb = await getIsolatedTestDb();
    // The synthetic identity is deliberately local to the isolated database.
    // It is never sent to Telegram and cannot collide with a production user.
    const syntheticTelegramId = `9${Date.now()}${crypto.randomInt(1000, 9999)}`;
    const result = await registerNewPlayer(testDb, {
      telegramUserId: syntheticTelegramId,
      telegramUsername: null,
      fullName,
      nickname,
      source: 'test_environment_registration',
    });
    resetLoginRateLimit(`test-register:${clientIp}`);
    setPlayerCookie(res, testEnvironmentPlayerId(result.player.id));
    res.clearCookie('organizer_token', { path: '/' });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      player: { id: result.player.id, nickname: result.player.nickname },
      redirectTo: '/player',
    });
  } catch (error: any) {
    if (error instanceof PlayerRegistrationError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    return res.status(500).json({ error: error?.message || 'Не удалось создать тестовый профиль' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('player_token', { path: '/' });
  res.clearCookie('organizer_token', { path: '/' });
  return res.json({ success: true, redirectTo: '/test-login' });
});

export default router;
