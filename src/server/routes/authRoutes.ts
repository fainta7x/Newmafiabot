import { Router, Response } from 'express';
import {
  verifyOrganizerPassword,
  generateOrganizerToken,
  AuthenticatedRequest,
  checkLoginRateLimit,
  resetLoginRateLimit,
} from '../auth.ts';
import { TelegramInitDataError, validateTelegramInitData } from '../telegramMiniAppAuth.ts';

const router = Router();

router.post('/telegram', (req, res) => {
  const initData = req.body?.initData;
  if (typeof initData !== 'string' || !initData) {
    return res.status(400).json({ error: 'Telegram init data is required.' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken) {
    return res.status(503).json({ error: 'Telegram authentication is not configured.' });
  }

  try {
    return res.json(validateTelegramInitData(initData, botToken));
  } catch (error) {
    if (error instanceof TelegramInitDataError) {
      return res.status(401).json({ error: error.message });
    }
    return res.status(401).json({ error: 'Invalid Telegram init data.' });
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
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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

router.get('/me', (req: AuthenticatedRequest, res: Response) => {
  return res.json({
    role: req.userRole || 'PLAYER',
    isOrganizer: req.userRole === 'ORGANIZER',
  });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('organizer_token', { path: '/' });
  return res.json({ success: true, role: 'PLAYER' });
});

export default router;
