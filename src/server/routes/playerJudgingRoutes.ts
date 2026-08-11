import { Router, type NextFunction, type Request, type Response } from 'express';
import { getPlayerSessionId, type AuthenticatedRequest } from '../auth.ts';
import gamesRoutes from './gamesRoutes.ts';
import tournamentsRoutes from './tournamentsRoutes.ts';
import tournamentProtocolRoutes from './tournamentProtocolRoutes.ts';
import {
  judgeLevelAllowsEveningFormat,
  normalizeJudgeLevel,
  requiredJudgeLevelForEveningFormat,
  type JudgeLevel,
} from '../../db/ensureJudgeAuthoritySchema.ts';

const router = Router();

const LEVEL_LABELS: Record<JudgeLevel, string> = {
  none: 'Нет полномочий',
  trainee: 'Начинающий ведущий',
  host: 'Ведущий',
  judge: 'Судья',
};

const safeJsonParse = <T = any>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const normalizeClubGame = (row: any) => {
  const clubProtocol = safeJsonParse<any>(row.protocol_text, null);
  const isClubProtocol = Boolean(clubProtocol && clubProtocol.version === 1 && clubProtocol.kind === 'club_evening_protocol');
  return {
    id: Number(row.id),
    evening_id: String(row.evening_id),
    evening_table_id: row.evening_table_id ?? null,
    table_name: row.table_name ?? null,
    global_game_number: Number(row.global_game_number || 0),
    game_date: row.game_date,
    winner_team: row.winner_team,
    winner_label: row.winner_label,
    judge_name: row.judge_name ?? null,
    judge_player_id: row.judge_player_id ?? null,
    slots: safeJsonParse(row.slots_json, []),
    status: isClubProtocol ? (clubProtocol.protocol?.status || 'draft') : (row.winner_team === 'draft' ? 'draft' : 'completed'),
    club_protocol: isClubProtocol ? clubProtocol : null,
    created_at: row.created_at,
    archived_at: row.archived_at ?? null,
    evening_title: row.evening_title || 'Игровой вечер',
    evening_format: row.evening_format || 'CASUAL',
    evening_starts_at: row.evening_starts_at || row.game_date,
    required_level: requiredJudgeLevelForEveningFormat(row.evening_format),
  };
};

const loadTournamentGame = async (db: any, gameRow: any) => {
  const seats = await db.all(`
    SELECT tgs.*, tp.display_name, tp.player_id,
           (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = tp.player_id) AS avatar_updated_at
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
     WHERE tgs.game_id = ?
     ORDER BY tgs.seat_number ASC
  `, [gameRow.id]);
  const protocol = await db.get('SELECT status FROM tournament_game_protocols WHERE game_id = ?', [gameRow.id]);
  return {
    id: String(gameRow.id),
    tournament_id: String(gameRow.tournament_id),
    game_number: Number(gameRow.game_number || 0),
    judge_name: gameRow.judge_name ?? null,
    judge_player_id: gameRow.judge_player_id ?? null,
    status: gameRow.status,
    winner_team: gameRow.winner_team ?? null,
    started_at: gameRow.started_at ?? null,
    completed_at: gameRow.completed_at ?? null,
    protocol_status: protocol?.status || null,
    seats,
    tournament_title: gameRow.tournament_title,
    tournament_date: gameRow.tournament_date,
    tournament_status: gameRow.tournament_status,
    venue: gameRow.venue ?? null,
    required_level: 'judge' as const,
  };
};

const requirePlayer = (req: Request, res: Response): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

router.get('/judging', async (req, res) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;
  const db = (req as any).db;
  try {
    const player = await db.get('SELECT id, nickname, judge_level FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });
    const judgeLevel = normalizeJudgeLevel(player.judge_level);

    const clubRows = await db.all(`
      SELECT g.*, e.title AS evening_title, e.format AS evening_format, e.starts_at AS evening_starts_at,
             et.name AS table_name
        FROM games g
        JOIN game_evenings e ON e.id = g.evening_id
   LEFT JOIN evening_tables et ON et.id = g.evening_table_id
       WHERE g.judge_player_id = ? AND g.archived_at IS NULL
       ORDER BY COALESCE(e.starts_at, g.game_date) DESC, g.global_game_number DESC
       LIMIT 60
    `, [playerId]);

    const tournamentRows = await db.all(`
      SELECT tg.*, t.title AS tournament_title, t.date AS tournament_date,
             t.status AS tournament_status, t.venue
        FROM tournament_games tg
        JOIN tournaments t ON t.id = tg.tournament_id
       WHERE tg.judge_player_id = ?
       ORDER BY COALESCE(tg.started_at, t.date) DESC, tg.game_number DESC
       LIMIT 60
    `, [playerId]);

    const clubGames = clubRows.map((row: any) => {
      const game = normalizeClubGame(row);
      return { ...game, can_conduct: judgeLevelAllowsEveningFormat(judgeLevel, row.evening_format) && game.status !== 'completed' };
    });
    const tournamentGames = await Promise.all(tournamentRows.map((row: any) => loadTournamentGame(db, row)));

    return res.json({
      player: {
        id: String(player.id),
        nickname: String(player.nickname),
        judge_level: judgeLevel,
        judge_level_label: LEVEL_LABELS[judgeLevel],
      },
      permissions: {
        novice: judgeLevel !== 'none',
        casual: judgeLevel === 'host' || judgeLevel === 'judge',
        rating: judgeLevel === 'judge',
        tournament: judgeLevel === 'judge',
      },
      club_games: clubGames,
      tournament_games: tournamentGames.map((game) => ({
        ...game,
        can_conduct: judgeLevel === 'judge' && game.tournament_status === 'active' && game.status !== 'completed',
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить судейство' });
  }
});

const clubDelegateGate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;
  if (req.method !== 'PUT' || !/^\/\d+\/evening-protocol$/.test(req.path)) {
    return res.status(403).json({ error: 'Эта операция не входит в полномочия ведущего' });
  }

  try {
    const gameId = Number(req.path.split('/')[1]);
    const db = (req as any).db;
    const game = await db.get(`
      SELECT g.*, e.format AS evening_format
        FROM games g
        JOIN game_evenings e ON e.id = g.evening_id
       WHERE g.id = ?
    `, [gameId]);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    if (String(game.judge_player_id || '') !== playerId) return res.status(403).json({ error: 'Вы не назначены ведущим этой игры' });
    const player = await db.get('SELECT judge_level FROM players WHERE id = ?', [playerId]);
    if (!judgeLevelAllowsEveningFormat(player?.judge_level, game.evening_format)) {
      return res.status(403).json({ error: 'Ваш уровень ведущего недостаточен для этого формата' });
    }
    const current = safeJsonParse<any>(game.protocol_text, null);
    if (current?.protocol?.status === 'completed') {
      return res.status(409).json({ error: 'Завершённую игру может корректировать только организатор' });
    }
    req.delegatedOrganizerAccess = true;
    req.delegatedPlayerId = playerId;
    return next();
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось проверить полномочия ведущего' });
  }
};

const tournamentDelegateGate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const playerId = requirePlayer(req, res);
  if (!playerId) return;

  const path = req.path;
  const detailMatch = path.match(/^\/([^/]+)$/);
  const rolesMatch = path.match(/^\/([^/]+)\/games\/([^/]+)\/roles$/);
  const startMatch = path.match(/^\/([^/]+)\/games\/([^/]+)\/start$/);
  const protocolMatch = path.match(/^\/([^/]+)\/games\/([^/]+)\/protocol$/);
  const completeMatch = path.match(/^\/([^/]+)\/games\/([^/]+)\/protocol\/complete$/);

  const allowedShape =
    (req.method === 'GET' && detailMatch) ||
    (req.method === 'PATCH' && rolesMatch) ||
    (req.method === 'POST' && startMatch) ||
    ((req.method === 'GET' || req.method === 'PUT') && protocolMatch) ||
    (req.method === 'POST' && completeMatch);
  if (!allowedShape) return res.status(403).json({ error: 'Эта операция не входит в полномочия судьи' });

  const match = detailMatch || rolesMatch || startMatch || protocolMatch || completeMatch;
  const tournamentId = match?.[1];
  const gameId = match?.[2] || null;

  try {
    const db = (req as any).db;
    const player = await db.get('SELECT judge_level FROM players WHERE id = ?', [playerId]);
    if (normalizeJudgeLevel(player?.judge_level) !== 'judge') {
      return res.status(403).json({ error: 'Турнирные игры доступны только игроку со званием «Судья»' });
    }

    if (gameId) {
      const game = await db.get(
        'SELECT tg.*, t.status AS tournament_status FROM tournament_games tg JOIN tournaments t ON t.id = tg.tournament_id WHERE tg.id = ? AND tg.tournament_id = ?',
        [gameId, tournamentId],
      );
      if (!game) return res.status(404).json({ error: 'Турнирная игра не найдена' });
      if (String(game.judge_player_id || '') !== playerId) return res.status(403).json({ error: 'Вы не назначены судьёй этой игры' });
      const isMutation = req.method !== 'GET';
      if (isMutation && game.tournament_status !== 'active') {
        return res.status(409).json({ error: 'Проводить игру можно только в активном турнире' });
      }
      if (isMutation && game.status === 'completed') {
        return res.status(409).json({ error: 'Завершённую игру может корректировать только организатор' });
      }
    } else {
      const assigned = await db.get(
        'SELECT 1 AS ok FROM tournament_games WHERE tournament_id = ? AND judge_player_id = ? LIMIT 1',
        [tournamentId, playerId],
      );
      if (!assigned) return res.status(403).json({ error: 'В этом турнире у вас нет назначенных игр' });
    }

    req.delegatedOrganizerAccess = true;
    req.delegatedPlayerId = playerId;
    return next();
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось проверить полномочия судьи' });
  }
};

router.use('/judging/delegated/games', clubDelegateGate, gamesRoutes);
router.use('/judging/delegated/tournaments', tournamentDelegateGate, tournamentsRoutes, tournamentProtocolRoutes);

export default router;
