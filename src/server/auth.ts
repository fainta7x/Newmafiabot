import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { normalizeJudgeLevel } from '../db/ensureJudgeAuthoritySchema.ts';
import { canHostEveningFormat } from '../lib/hostFormats.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../db/ensureOrganizerPlayerAccessSchema.ts';
import { cabinetOrganizeFormats, canOrganizeEveningFormat } from '../lib/organizeFormats.ts';

dotenv.config();

if (process.env.NODE_ENV === 'production') {
  if (!process.env.ORGANIZER_PASSWORD || !process.env.JWT_SECRET) {
    console.error('FATAL ERROR: ORGANIZER_PASSWORD and JWT_SECRET must be set in production!');
    process.exit(1);
  }
}

// Production refuses to start without JWT_SECRET (above). Elsewhere use a
// per-process random key instead of a shared hard-coded one, so no well-known
// secret can ever sign a session that another environment would accept.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ORGANIZER_PASSWORD = process.env.ORGANIZER_PASSWORD || 'adminpass';
// v3: sandbox organizer logins were previously issued as production root
// sessions; bumping the version revokes every token minted before the fix.
const ORGANIZER_SESSION_VERSION = 3;

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

export function generateOrganizerToken(organizerPlayerId?: string, options: { sandbox?: boolean } = {}): string {
  if (options.sandbox) {
    // Valid only together with a sandbox player session (isolated test DB).
    return jwt.sign(
      { role: 'ORGANIZER', organizerSessionType: 'test_sandbox', organizerSessionVersion: ORGANIZER_SESSION_VERSION },
      JWT_SECRET,
      { expiresIn: '1d' },
    );
  }
  return jwt.sign(
    organizerPlayerId
      ? {
          role: 'ORGANIZER',
          organizerPlayerId,
          organizerSessionType: 'player_bound',
          organizerSessionVersion: ORGANIZER_SESSION_VERSION,
        }
      : {
          role: 'ORGANIZER',
          organizerSessionType: 'root_password',
          organizerSessionVersion: ORGANIZER_SESSION_VERSION,
        },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

export function generatePlayerSessionToken(playerId: string): string {
  return jwt.sign({ session: 'PLAYER', playerId }, JWT_SECRET, { expiresIn: '7d' });
}

const TEST_PLAYER_SESSION_PREFIX = '__test__:';

function decodePlayerSession(req: Request): { playerId: string } | null {
  const token = req.cookies?.player_token;
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { session?: string; playerId?: string };
    if (decoded.session === 'PLAYER' && typeof decoded.playerId === 'string' && decoded.playerId) {
      return { playerId: decoded.playerId };
    }
  } catch {
    // Invalid or expired player session is treated as unlinked.
  }
  return null;
}

export function testEnvironmentPlayerId(playerId: string): string {
  return `${TEST_PLAYER_SESSION_PREFIX}${playerId}`;
}

export function isTestEnvironmentRequest(req: Request): boolean {
  return Boolean(decodePlayerSession(req)?.playerId.startsWith(TEST_PLAYER_SESSION_PREFIX));
}

export function getPlayerSessionId(req: Request): string | null {
  const decoded = decodePlayerSession(req);
  if (!decoded) return null;
  return decoded.playerId.startsWith(TEST_PLAYER_SESSION_PREFIX)
    ? decoded.playerId.slice(TEST_PLAYER_SESSION_PREFIX.length)
    : decoded.playerId;
}

export interface AuthenticatedRequest extends Request {
  userRole?: 'PLAYER' | 'ORGANIZER';
  delegatedOrganizerAccess?: boolean;
  delegatedPlayerId?: string;
  /** Set when a player with «Может проводить вечера» marks acts in his limited cabinet. */
  eventHostPlayerId?: string;
  organizerActorId?: string;
  organizerPlayerId?: string;
  testEnvironment?: boolean;
}

const organizerSessionActorId = (token: string) =>
  `organizer-session:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 24)}`;

export function getAuthenticatedOrganizerActorId(req: AuthenticatedRequest): string | null {
  if (req.delegatedPlayerId) return `player:${req.delegatedPlayerId}`;
  if (req.organizerPlayerId) return `player:${req.organizerPlayerId}`;
  return req.organizerActorId || null;
}

export async function parseUserSession(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  req.testEnvironment = isTestEnvironmentRequest(req);

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
      const decoded = jwt.verify(token, JWT_SECRET) as {
        role?: string;
        organizerPlayerId?: string;
        organizerSessionType?: string;
        organizerSessionVersion?: number;
      };
      if (decoded.role === 'ORGANIZER' && decoded.organizerSessionVersion === ORGANIZER_SESSION_VERSION) {
        const organizerPlayerId = typeof decoded.organizerPlayerId === 'string' ? decoded.organizerPlayerId.trim() : '';
        if (decoded.organizerSessionType === 'player_bound' && organizerPlayerId) {
          const db = req.db;
          if (db) {
            try {
              const access = await db.get<{ player_id: string }>(
                'SELECT player_id FROM organizer_player_access WHERE player_id = ? LIMIT 1',
                [organizerPlayerId],
              );
              if (access?.player_id) {
                req.userRole = 'ORGANIZER';
                req.organizerPlayerId = organizerPlayerId;
                return next();
              }
            } catch {
              // Missing/unavailable entitlement storage means the identity-bound organizer session is not trusted.
            }
          }
        } else if (decoded.organizerSessionType === 'root_password' && !organizerPlayerId) {
          req.userRole = 'ORGANIZER';
          req.organizerActorId = organizerSessionActorId(token);
          return next();
        } else if (decoded.organizerSessionType === 'test_sandbox' && isTestEnvironmentRequest(req)) {
          // A sandbox organizer never reaches the production database.
          req.userRole = 'ORGANIZER';
          req.organizerActorId = organizerSessionActorId(token);
          return next();
        }
      }
    } catch (e) {
      // Invalid, expired or legacy organizer token falls back to PLAYER.
    }
  }

  req.userRole = 'PLAYER';
  next();
}

const requestPath = (req: Request) => String(req.originalUrl || req.url || '').split('?')[0];

async function canUseAssignedJudgeRoute(req: AuthenticatedRequest): Promise<boolean> {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return false;
  const db = req.db;
  if (!db) return false;
  const path = requestPath(req);

  const clubCreateMatch = path.match(/^\/api\/games\/evening\/([^/]+)\/?$/);
  if (clubCreateMatch && req.method === 'POST') {
    const evening = await db.get(
      'SELECT id, format, status FROM game_evenings WHERE id = ? LIMIT 1',
      [decodeURIComponent(clubCreateMatch[1])],
    );
    if (!evening || !['published', 'active'].includes(String(evening.status || ''))) return false;

    const player = await db.get('SELECT judge_level, host_formats FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!canHostEveningFormat(player, evening.format)) return false;

    const requestedJudgeId = req.body?.judge_player_id == null ? playerId : String(req.body.judge_player_id);
    if (requestedJudgeId !== playerId) return false;

    req.delegatedOrganizerAccess = true;
    req.delegatedPlayerId = playerId;
    return true;
  }

  const clubMatch = path.match(/^\/api\/games\/(\d+)\/(evening-protocol|broadcast-config|broadcast-state|start)\/?$/);
  const clubAction = clubMatch?.[2];
  const clubMethodAllowed = (
    (clubAction === 'evening-protocol' && req.method === 'PUT')
    || (clubAction === 'broadcast-config' && req.method === 'GET')
    || (clubAction === 'broadcast-state' && req.method === 'PUT')
    || (clubAction === 'start' && req.method === 'POST')
  );
  if (clubMatch && clubMethodAllowed) {
    const game = await db.get(`
      SELECT g.judge_player_id, g.archived_at, g.protocol_text, e.format AS evening_format
        FROM games g
        JOIN game_evenings e ON e.id = g.evening_id
       WHERE g.id = ?
       LIMIT 1
    `, [Number(clubMatch[1])]);
    if (!game || String(game.judge_player_id || '') !== playerId || game.archived_at) return false;
    const player = await db.get('SELECT judge_level, host_formats FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!canHostEveningFormat(player, game.evening_format)) return false;
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

/**
 * Limited cabinet «Проводит вечера» (owner decision 2026-09-29, BUSINESS_RULES «Club roles»).
 * A player with `organize_formats` marks, signed in with his own player session, may:
 * - read every evening and game, and the player list (to add people to his evening);
 * - create an evening of a marked kind (the route makes him its organizer);
 * - on an evening he organizes (evening_staff_assignments) whose kind is marked: everything the
 *   evening screens do — attendance, payment, tables and games, announcement, closing —
 *   except deleting the evening or handing it to another organizer.
 * Nothing else of the cabinet.
 */
const EVENING_PATH_WORDS = new Set(['tables', 'participants', 'create-next-friday', 'duplicate-last']);

async function eveningIdForEventHostPath(db: any, path: string): Promise<{ eveningId: string; rest: string } | null> {
  const table = path.match(/^\/api\/evenings\/tables\/([^/]+)/);
  if (table) {
    const row = await db.get('SELECT evening_id FROM evening_tables WHERE id = ? LIMIT 1', [decodeURIComponent(table[1])]);
    return row?.evening_id ? { eveningId: String(row.evening_id), rest: '/tables' } : null;
  }
  const participant = path.match(/^\/api\/(?:evenings\/participants|participant|evening-participants)\/([^/]+)/);
  if (participant) {
    const row = await db.get('SELECT evening_id FROM evening_participants WHERE id = ? LIMIT 1', [decodeURIComponent(participant[1])]);
    return row?.evening_id ? { eveningId: String(row.evening_id), rest: '/participants' } : null;
  }
  const evening = path.match(/^\/api\/evenings\/([^/]+)(\/.*)?$/);
  if (evening && !EVENING_PATH_WORDS.has(evening[1])) return { eveningId: decodeURIComponent(evening[1]), rest: evening[2] || '' };
  const newGame = path.match(/^\/api\/games\/evening\/([^/]+)\/?$/);
  if (newGame) return { eveningId: decodeURIComponent(newGame[1]), rest: '/games' };
  const game = path.match(/^\/api\/games\/(\d+)(?:\/|$)/);
  if (game) {
    const row = await db.get('SELECT evening_id FROM games WHERE id = ? LIMIT 1', [Number(game[1])]);
    return row?.evening_id ? { eveningId: String(row.evening_id), rest: '/games' } : null;
  }
  return null;
}

export async function canUseEventHostRoute(req: AuthenticatedRequest): Promise<boolean> {
  const db = req.db;
  const playerId = getPlayerSessionId(req);
  if (!db || !playerId) return false;
  const player = await db.get<any>('SELECT id, organize_formats, contact_status FROM players WHERE id = ? LIMIT 1', [playerId])
    .catch(() => null);
  if (!player || String(player.contact_status || '') === 'blocked') return false;
  if (!cabinetOrganizeFormats(player.organize_formats).length) return false;

  const path = requestPath(req);
  const method = req.method.toUpperCase();
  const grant = () => {
    req.delegatedOrganizerAccess = true;
    req.delegatedPlayerId = playerId;
    req.eventHostPlayerId = playerId;
    return true;
  };

  if ((method === 'GET' || method === 'HEAD') && (/^\/api\/(evenings|games)(\/|$)/.test(path) || path === '/api/players' || path === '/api/players/')) {
    return grant();
  }
  if (method === 'POST' && /^\/api\/evenings\/?$/.test(path)) {
    // Tournaments have their own flow (tournaments table: registration, judge, fee, prizes).
    if (String(req.body?.format || '').toUpperCase() === 'TOURNAMENT') return false;
    return canOrganizeEveningFormat(player, req.body?.format) ? grant() : false;
  }

  const target = await eveningIdForEventHostPath(db, path);
  if (!target) return false;
  // Never delete the evening or hand it to another organizer.
  if (method === 'DELETE' && target.rest === '') return false;
  // The host may set or change the «Судья вечера» of his own evening, never the organizer.
  const judgeOnly = method === 'PATCH' && target.rest === '/staff'
    && Object.keys(req.body || {}).length > 0 && Object.keys(req.body || {}).every((key) => key === 'judge_player_id');
  if (target.rest.startsWith('/staff') && !judgeOnly) return false;
  if (method === 'PATCH' && target.rest === '' && req.body?.format !== undefined && !canOrganizeEveningFormat(player, req.body.format)) return false;

  const evening = await db.get<any>(`
    SELECT e.format, s.organizer_player_id
      FROM game_evenings e
      LEFT JOIN evening_staff_assignments s ON s.evening_id = e.id
     WHERE e.id = ? LIMIT 1
  `, [target.eveningId]).catch(() => null);
  if (!evening || String(evening.organizer_player_id || '') !== playerId) return false;
  if (!canOrganizeEveningFormat(player, evening.format)) return false;
  return grant();
}

/**
 * «Владелец» (owner decision 2026-09-28): the club owner's own player account or the root password session.
 * Only the owner grants and removes club organizers, sees club money and deletes players.
 */
export function isClubOwner(req: AuthenticatedRequest): boolean {
  if (req.userRole !== 'ORGANIZER' || req.delegatedOrganizerAccess) return false;
  if (req.organizerPlayerId) return req.organizerPlayerId === PRIMARY_ORGANIZER_PLAYER_ID;
  return Boolean(req.organizerActorId);
}

export function requireClubOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (isClubOwner(req)) return next();
  return res.status(403).json({ error: 'Это может сделать только владелец клуба', code: 'club_owner_required' });
}

export async function requireOrganizerAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.userRole === 'ORGANIZER' || req.delegatedOrganizerAccess) return next();

  try {
    if (await canUseAssignedJudgeRoute(req)) return next();
    if (await canUseEventHostRoute(req)) return next();
  } catch (error) {
    console.error('[AUTH] Judge delegation check failed:', error);
  }

  return res.status(401).json({
    error: 'Доступ запрещён',
    message: 'Доступ разрешен только организатору или ведущему/судье в рамках своих полномочий',
  });
}
