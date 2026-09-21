import crypto from 'node:crypto';
import { Router } from 'express';
import {
  generateOrganizerToken,
  generatePlayerSessionToken,
} from '../auth.ts';

const router = Router();
const TEST_PLAYER_ID = 'p-test-1';

function testEnvironmentEnabled(): boolean {
  return process.env.APP_ENV === 'test';
}

function safePasswordMatch(actual: unknown): boolean {
  const expected = String(process.env.TEST_ACCESS_PASSWORD || '');
  const received = typeof actual === 'string' ? actual : '';
  if (!expected || expected.length < 12 || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

router.get('/status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    enabled: testEnvironmentEnabled(),
    label: testEnvironmentEnabled() ? 'ТЕСТОВАЯ ВЕРСИЯ' : null,
  });
});

router.post('/login', async (req, res) => {
  if (!testEnvironmentEnabled()) return res.status(404).json({ error: 'Not found' });
  if (!safePasswordMatch(req.body?.password)) {
    return res.status(401).json({ error: 'Неверный пароль тестовой версии' });
  }

  const role = String(req.body?.role || '').trim();
  if (role !== 'player' && role !== 'organizer') {
    return res.status(400).json({ error: 'Выберите вход игрока или организатора' });
  }

  const player = await req.db.get<{ id: string }>(
    'SELECT id FROM players WHERE id = ? LIMIT 1',
    [TEST_PLAYER_ID],
  );
  if (!player) {
    return res.status(503).json({
      error: 'Тестовый игрок не создан. Проверьте APP_ENV=test и SEED_DEMO_DATA=true.',
    });
  }

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  res.cookie('player_token', generatePlayerSessionToken(TEST_PLAYER_ID), cookieOptions);
  if (role === 'organizer') {
    res.cookie('organizer_token', generateOrganizerToken(), cookieOptions);
  } else {
    res.clearCookie('organizer_token', { path: '/' });
  }

  return res.json({
    success: true,
    role: role === 'organizer' ? 'ORGANIZER' : 'PLAYER',
    playerId: TEST_PLAYER_ID,
    redirectTo: role === 'organizer' ? '/admin' : '/player',
  });
});

export default router;
