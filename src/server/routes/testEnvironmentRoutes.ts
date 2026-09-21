import crypto from 'node:crypto';
import { Router } from 'express';
import { getIsolatedTestDb } from '../../db/index.ts';
import {
  getTestEnvironmentSession,
  TEST_ENVIRONMENT_COOKIE,
} from '../auth.ts';
import { setTestEnvironmentCookie } from './authRoutes.ts';

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
    active: Boolean(getTestEnvironmentSession(req)),
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

  const testDb = await getIsolatedTestDb();
  const player = await testDb.get<{ id: string }>(
    'SELECT id FROM players WHERE id = ? LIMIT 1',
    [TEST_PLAYER_ID],
  );
  if (!player) return res.status(503).json({ error: 'Тестовый игрок не создан' });

  const signedRole = role === 'organizer' ? 'ORGANIZER' : 'PLAYER';
  setTestEnvironmentCookie(res, signedRole, TEST_PLAYER_ID);

  return res.json({
    success: true,
    role: signedRole,
    playerId: TEST_PLAYER_ID,
    redirectTo: role === 'organizer' ? '/admin' : '/player',
  });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(TEST_ENVIRONMENT_COOKIE, { path: '/' });
  return res.json({ success: true, redirectTo: '/test-login' });
});

export default router;
