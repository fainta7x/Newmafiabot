import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { judgeLevelAllowsEveningFormat, normalizeJudgeLevel } from '../db/ensureJudgeAuthoritySchema.ts';

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

const requestPath = (req: Request) => String(req.originalUrl || req.url || '').split('?')[0];

async function canUseAssignedJudgeRoute(req: AuthenticatedRequest): Promise<boolean> {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return false;
  const db = (req as any).db;
  if (!db) return false;
  const path = requestPath(req);

  const clubMatch = path.match(/^\/api\/games\/(\d+)\/evening-protocol\/?$/);
  if (clubMatch && req.method === 'PUT') {
    const game = await db.get(`
      SELECT g.judge_player_id, g.archived_at, g.protocol_text, e.format AS evening_format
        FROM games g
        JOIN game_evenings e ON e.id = g.evening_id
       WHERE g.id = ?
       LIMIT 1
    `, [Number(clubMatch[1])]);
    if (!game || String(game.judge_player_id || '') !== playerId || game.archived_at) return false;
    const player = await db.get('SELECT judge_level FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!judgeLevelAllowsEveningFormat(player?.judge_level, game.evening_format)) return false;
    try {
      const existing = typeof game.protocol_text === 'string' ? JSON.parse(game.protocol_text) : null;
      if (existing?.protocol?.status === 'completed') return false;
    } catch {
      return false;
    }
    req.delegatedOrganizerAccess = true;
    req.delegatedPlayerId = playerId;
    return true;
  }

  const tournamentMatch = path.match(/^\/api\/tournaments\/([^/]+)\/games\/([^/]+)\/(roles|start|protocol(?:\/complete)?)\/?$/);
  if (!tournamentMatch) return false;

  const action = tournamentMatch[3];
  const methodAllowed =
    (action === 'roles' && req.method === 'PATCH') ||
    (action === 'start' && req.method === 'POST') ||
    (action === 'protocol' && (req.method === 'GET' || req.method === 'PUT')) ||
    (action === 'protocol/complete' && req.method === 'POST');
  if (!methodAllowed) return false;

  const player = await db.get('SELECT judge_level FROM players WHERE id = ? LIMIT 1', [playerId]);
  if (normalizeJudgeLevel(player?.judge_level) !== 'judge') return false;

  const game = await db.get(`
    SELECT tg.judge_player_id, tg.status AS game_status, t.status AS tournament_status
      FROM tournament_games tg
      JOIN tournaments t ON t.id = tg.tournament_id
     WHERE tg.id = ? AND tg.tournament_id = ?
     LIMIT 1
  `, [tournamentMatch[2], tournamentMatch[1]]);
  if (!game || String(game.judge_player_id || '') !== playerId) return false;

  if (req.method !== 'GET') {
    if (game.tournament_status !== 'active' || game.game_status === 'completed') return false;
  }

  req.delegatedOrganizerAccess = true;
  req.delegatedPlayerId = playerId;
  return true;
}

export async function requireOrganizerAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.userRole === 'ORGANIZER' || req.delegatedOrganizerAccess) return next();

  try {
    if (await canUseAssignedJudgeRoute(req)) return next();
  } catch (error) {
    console.error('[AUTH] Judge delegation check failed:', error);
  }

  return res.status(401).json({
    error: 'Доступ запрещён',
    message: 'Доступ разрешен только организатору или назначенному ведущему этой игры',
  });
}
