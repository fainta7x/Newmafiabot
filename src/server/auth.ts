import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-this-in-production';
const ORGANIZER_PASSWORD = process.env.ORGANIZER_PASSWORD || 'admin';

export function verifyOrganizerPassword(password: string): boolean {
  return password === ORGANIZER_PASSWORD;
}

export function generateOrganizerToken(): string {
  return jwt.sign({ role: 'ORGANIZER' }, JWT_SECRET, { expiresIn: '7d' });
}

export interface AuthenticatedRequest extends Request {
  userRole?: 'PLAYER' | 'ORGANIZER';
}

export function parseUserSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.cookies?.organizer_token;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
      if (decoded.role === 'ORGANIZER') {
        req.userRole = 'ORGANIZER';
        return next();
      }
    } catch (e) {
      // Invalid token, treat as player
    }
  }

  req.userRole = 'PLAYER';
  next();
}

export function requireOrganizerAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'ORGANIZER') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Доступ разрешен только авторизованным организаторам клуба',
    });
  }
  next();
}
