import { Router, Response } from 'express';
import { verifyOrganizerPassword, generateOrganizerToken, AuthenticatedRequest } from '../auth.ts';

const router = Router();

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Пароль не указан' });
  }

  if (verifyOrganizerPassword(password)) {
    const token = generateOrganizerToken();
    res.cookie('organizer_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      success: true,
      token,
      role: 'ORGANIZER',
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

router.post('/logout', (req, res) => {
  res.clearCookie('organizer_token');
  return res.json({ success: true, role: 'PLAYER' });
});

export default router;
