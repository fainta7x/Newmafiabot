import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

if (process.env.NODE_ENV === 'production') {
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
  return password === ORGANIZER_PASSWORD;
}

export function generateOrganizerToken(): string {
  return jwt.sign({ role: 'ORGANIZER' }, JWT_SECRET, { expiresIn: '7d' });
}

export function generatePlayerSessionToken(playerId: string): string {
  return jwt.sign({ session: 'PLAYER', playerId }, JWT_SECRET, { expiresIn: '7d' });
}

export function getPlayerSessionId(req: Request): string | null {
  const token = req.cookies?.player_token;
  if (!token || typeof token !== 'string') return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { session?: string; playerId?: string };
    if (decoded.session === 'PLAYER' && typeof decoded.playerId === 'string' && decoded.playerId) {
      return decoded.playerId;
    }
  } catch {
    // Invalid or expired player session is treated as unlinked.
  }

  return null;
}

export interface AuthenticatedRequest extends Request {
  userRole?: 'PLAYER' | 'ORGANIZER';
  delegatedOrganizerAccess?: boolean;
  delegatedPlayerId?: string;
}

export function parseUserSession(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
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
  if (req.userRole !== 'ORGANIZER' && !req.delegatedOrganizerAccess) {
    return res.status(401).json({
      error: 'Доступ запрещён',
      message: 'Доступ разрешен только авторизованным организаторам клуба',
    });
  }
  next();
}
