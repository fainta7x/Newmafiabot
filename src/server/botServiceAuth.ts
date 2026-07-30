import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function botServiceAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.BOT_API_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'Bot API Secret is not configured' });
    return;
  }

  const token = req.header('X-Bot-Token');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing X-Bot-Token' });
    return;
  }

  const bufSecret = Buffer.from(secret);
  const bufToken = Buffer.from(token);

  if (bufSecret.length !== bufToken.length) {
    res.status(401).json({ error: 'Unauthorized: Invalid X-Bot-Token' });
    return;
  }

  if (!crypto.timingSafeEqual(bufSecret, bufToken)) {
    res.status(401).json({ error: 'Unauthorized: Invalid X-Bot-Token' });
    return;
  }

  next();
}
