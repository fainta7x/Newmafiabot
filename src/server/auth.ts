import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

// TEMPORARY TOURNAMENT-DAY MODE: AI Studio Preview is currently used only by
// the organizer, so authentication is bypassed in development until the
// post-tournament security pass. Tests and production keep real auth enabled.
const ORGANIZER_AUTH_DISABLED =
  process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production';

if (process.env.NODE_ENV === 'production' && !ORGANIZER_AUTH_DISABLED) {
  if (!process.env.ORGANIZER_PASSWORD || !process.env.JWT_SECRET) {
    console.error('FATAL ERROR: ORGANIZER_PASSWORD and JWT_SECRET must be set in production!');
    process.exit(1);
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-jwt-secret-key-for-local-testing';
const ORGANIZER_PASSWORD = process.env.ORGANIZER_PASSWORD || 'adminpass';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (!attempt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (now > attempt.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (attempt.count >= 5) {
    return false;
  }
  attempt.count++;
  return true;
}

export function resetLoginRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

export function verifyOrganizerPassword(password: string): boolean {
  return ORGANIZER_AUTH_DISABLED || password === ORGANIZER_PASSWORD;
}

export function generateOrganizerToken(): string {
  return jwt.sign({ role: 'ORGANIZER' }, JWT_SECRET, { expiresIn: '7d' });
}

export interface AuthenticatedRequest extends Request {
  userRole?: 'PLAYER' | 'ORGANIZER';
}

export function parseUserSession(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  if (ORGANIZER_AUTH_DISABLED) {
    req.userRole = 'ORGANIZER';
    return next();
  }

  let token = req.cookies?.organizer_token;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.headers['x-organizer-token']) {
      token = req.headers['x-organizer-token'] as string;
    }
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
      if (decoded.role === 'ORGANIZER') {
        req.userRole = 'ORGANIZER';
        return next();
      }
    } catch (e) {
      // Invalid token, fallback to PLAYER
    }
  }

  req.userRole = 'PLAYER';
  next();
}

export function requireOrganizerAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'ORGANIZER') {
    return res.status(401).json({
      error: 'Доступ запрещён',
      message: 'Доступ разрешен только авторизованным организаторам клуба',
    });
  }
  next();
}
