import { Router } from 'express';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import { getPlayerSessionId } from '../auth.ts';
import { loadPlayerEloHistory, type PlayerEloHistoryEvent } from '../services/playerEloHistoryService.ts';

const router = Router();

type GameSource = 'club' | 'tournament';
type Team = 'red' | 'black' | null;

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const safeJsonParse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

const normalizeRole = (role: unknown): 'citizen' | 'sheriff' | 'mafia' | 'don' | null => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель', 'красный'].includes(value)) return 'citizen';
  if (['sheriff', 'шериф'].includes(value)) return 'sheriff';
  if (['mafia', 'мафия', 'маф'].includes(value)) return 'mafia';
  if (['don', 'дон'].includes(value)) return 'don';
  return null;
};

const teamFromRole = (role: unknown): Team => {
  const normalized = normalizeRole(role);
  if (normalized === 'citizen' || normalized === 'sheriff') return 'red';
  if (normalized === 'mafia' || normalized === 'don') return 'black';
  return null;
};

const normalizeWinner = (value: unknown): Team => {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};

const numeric = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const repositoryAvatarAvailable = (playerId: string, suppressed: unknown) =>
  !Number(suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(playerId));

const playerAvatarUrl = (playerId: string, hasDbAvatar: unknown, suppressed: unknown) =>
  Number(hasDbAvatar || 0) || repositoryAvatarAvailable(playerId, suppressed)
    ? `/api/player/players/${encodeURIComponent(playerId)}/avatar`
    : null;

const parseGameKey = (value: unknown): { source: GameSource; sourceId: string } | null => {
  const key = String(value || '').trim();
  const separator = key.indexOf(':');
  if (separator <= 0 || separator === key.length - 1) return null;
  const source = key.slice(0, separator);
  const sourceId = key.slice(separator + 1);
  if (source !== 'club' && source !== 'tournament') return null;
  return { source, sourceId };
};

const timelineEvent = (timeline: PlayerEloHistoryEvent[], source: GameSource, sourceId: string) =>
  timeline.find((event) => event.source === source && event.sourceId === sourceId) || null;

const eloForPlayer = (event: PlayerEloHistoryEvent | null, playerId: string | null) => {
  if (!event || !playerId) return null;
  return event.players.find((player) => player.playerId === playerId) || null;
};

const playerRowsById = async (db: any) => {
  const rows = await db.all(`
    SELECT p.id, p.nickname,
           EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
           EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
      FROM players p
  `);
  const result = new Map<string, any>();
  for (const row of rows as any[]) result.set(String(row.id), row);
  return result;
};

const clubBestMoveParticipantIds = (protocol: any) => {
  const result = new Set<string>();
  if (Array.isArray(protocol?.best_moves)) {
    for (const move of protocol.best_moves) {
      const participantId = String(move?.participant_id || '').trim();
      if (participantId) result.add(participantId);
    }
  }
  const legacy = String(protocol?.best_move_participant_id || '').trim();
  if (legacy) result.add(legacy);
  return result;
};

router.get('/games/elo', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = (req as any).db;
    const timeline = await loadPlayerEloHistory(db);
    const games = timeline.flatMap((event) => {
      const row = event.players.find((player) => player.playerId === playerId);
      if (!row) return [];
      return [{
        id: `${event.source}:${event.sourceId}`,
        elo_before: row.eloBefore,
        elo_after: row.eloAfter,
        elo_delta: row.totalDelta,
      }];
    });
    return res.json({ games });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить историю Elo' });
  }
});

router.get('/games/:gameKey', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;
  const parsed = parseGameKey(req.params.gameKey);
  if (!parsed) return res.status(400).json({ error: 'Некорректный идентификатор игры' });

  try {
    const db = (req as any).db;
    const timeline = await loadPlayerEloHistory(db);
    const eloEvent = timelineEvent(timeline, parsed.source, parsed.sourceId);

    if (parsed.source === 'club') {
      const row = await db.get(`
        SELECT g.id, g.global_game_number, g.game_date, g.winner_team, g.judge_name, g.protocol_text,
               e.title AS evening_title, e.starts_at AS evening_date, e.format AS evening_format,
               et.name AS table_name
          FROM games g
     LEFT JOIN game_evenings e ON e.id = g.evening_id
     LEFT JOIN evening_tables et ON et.id = g.evening_table_id
         WHERE g.id = ? AND g.evening_id IS NOT NULL AND g.archived_at IS NULL
         LIMIT 1
      `, [parsed.sourceId]);
      if (!row) return res.status(404).json({ error: 'Игра не найдена' });

      const payload = safeJsonParse(row.protocol_text);
      const protocol = payload?.protocol || {};
      if (!payload || payload.kind !== 'club_evening_protocol' || protocol.status !== 'completed') {
        return res.status(409).json({ error: 'Игра ещё не завершена' });
      }

      const winnerTeam = normalizeWinner(protocol.winner_team || row.winner_team);
      const playersById = await playerRowsById(db);
      const bestMoveIds = clubBestMoveParticipantIds(protocol);
      const firstKilledId = String(protocol.first_killed_participant_id || '');
      const zeroRoundVotedId = String(protocol.zero_round_voted_participant_id || '');
      const results = Array.isArray(payload.player_results) ? payload.player_results : [];

      const players = results.map((result: any) => {
        const playerId = String(result?.player_id || '').trim() || null;
        const participantId = String(result?.participant_id || '').trim();
        const player = playerId ? playersById.get(playerId) : null;
        const role = normalizeRole(result?.role);
        const team = teamFromRole(role);
        const elo = eloForPlayer(eloEvent, playerId);
        return {
          player_id: playerId,
          nickname: player?.nickname || result?.display_name || 'Игрок',
          avatar_url: playerId && player
            ? playerAvatarUrl(playerId, player.has_db_avatar, player.avatar_suppressed)
            : null,
          seat_number: numeric(result?.seat_number),
          role,
          team,
          won: Boolean(team && winnerTeam && team === winnerTeam),
          exit_type: result?.exit_type || null,
          regular_fouls: numeric(result?.regular_fouls),
          minor_technical_fouls: numeric(result?.minor_technical_fouls),
          major_technical_fouls: numeric(result?.major_technical_fouls),
          judge_bonus: numeric(result?.judge_bonus),
          protocol_bonus: numeric(result?.protocol_bonus),
          ci_points: numeric(result?.ci_points),
          penalty_points: numeric(result?.penalty_points),
          disciplinary_penalty_points: numeric(result?.disciplinary_penalty_points),
          first_killed: participantId === firstKilledId,
          zero_round_voted: participantId === zeroRoundVotedId,
          best_move: bestMoveIds.has(participantId),
          elo_before: elo?.eloBefore ?? null,
          elo_after: elo?.eloAfter ?? null,
          elo_delta: elo?.totalDelta ?? null,
        };
      }).sort((a: any, b: any) => a.seat_number - b.seat_number);

      return res.json({
        game: {
          id: `club:${row.id}`,
          source: 'club',
          title: row.evening_title || 'Клубный вечер',
          date: row.evening_date || row.game_date || null,
          game_number: numeric(row.global_game_number),
          format: String(row.evening_format || 'CASUAL'),
          winner_team: winnerTeam,
          judge_name: row.judge_name || null,
          table_name: row.table_name || null,
          elo_affected: Boolean(eloEvent),
        },
        players,
      });
    }

    const game = await db.get(`
      SELECT tg.id, tg.game_number, tg.judge_name, tg.completed_at,
             COALESCE(tgp.winner_team, tg.winner_team) AS winner_team,
             t.title AS tournament_title, t.date AS tournament_date
        FROM tournament_games tg
        JOIN tournaments t ON t.id = tg.tournament_id
   LEFT JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
       WHERE tg.id = ? AND tg.status = 'completed'
       LIMIT 1
    `, [parsed.sourceId]);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });

    const winnerTeam = normalizeWinner(game.winner_team);
    const rows = await db.all(`
      SELECT tp.id AS participant_id, p.id AS player_id, p.nickname,
             tgs.seat_number, tgs.role,
             tgpr.exit_type, tgpr.regular_fouls, tgpr.minor_technical_fouls,
             tgpr.major_technical_fouls, tgpr.judge_bonus, tgpr.protocol_bonus,
             tgpr.ci_points, tgpr.penalty_points, tgpr.disciplinary_penalty_points,
             tgp.first_killed_participant_id, tgp.zero_round_voted_participant_id,
             EXISTS(
               SELECT 1 FROM tournament_game_best_moves tgbm
                WHERE tgbm.game_id = tgs.game_id AND tgbm.participant_id = tp.id
             ) AS best_move,
             EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
             EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
   LEFT JOIN players p ON p.id = tp.player_id
   LEFT JOIN tournament_game_player_results tgpr
          ON tgpr.game_id = tgs.game_id AND tgpr.participant_id = tp.id
   LEFT JOIN tournament_game_protocols tgp ON tgp.game_id = tgs.game_id
       WHERE tgs.game_id = ?
       ORDER BY tgs.seat_number ASC
    `, [parsed.sourceId]);

    const players = rows.map((row: any) => {
      const playerId = row.player_id ? String(row.player_id) : null;
      const participantId = String(row.participant_id || '');
      const role = normalizeRole(row.role);
      const team = teamFromRole(role);
      const elo = eloForPlayer(eloEvent, playerId);
      return {
        player_id: playerId,
        nickname: row.nickname || 'Игрок',
        avatar_url: playerId
          ? playerAvatarUrl(playerId, row.has_db_avatar, row.avatar_suppressed)
          : null,
        seat_number: numeric(row.seat_number),
        role,
        team,
        won: Boolean(team && winnerTeam && team === winnerTeam),
        exit_type: row.exit_type || null,
        regular_fouls: numeric(row.regular_fouls),
        minor_technical_fouls: numeric(row.minor_technical_fouls),
        major_technical_fouls: numeric(row.major_technical_fouls),
        judge_bonus: numeric(row.judge_bonus),
        protocol_bonus: numeric(row.protocol_bonus),
        ci_points: numeric(row.ci_points),
        penalty_points: numeric(row.penalty_points),
        disciplinary_penalty_points: numeric(row.disciplinary_penalty_points),
        first_killed: participantId === String(row.first_killed_participant_id || ''),
        zero_round_voted: participantId === String(row.zero_round_voted_participant_id || ''),
        best_move: Boolean(row.best_move),
        elo_before: elo?.eloBefore ?? null,
        elo_after: elo?.eloAfter ?? null,
        elo_delta: elo?.totalDelta ?? null,
      };
    });

    return res.json({
      game: {
        id: `tournament:${game.id}`,
        source: 'tournament',
        title: game.tournament_title || 'Турнир',
        date: game.completed_at || game.tournament_date || null,
        game_number: numeric(game.game_number),
        format: 'TOURNAMENT',
        winner_team: winnerTeam,
        judge_name: game.judge_name || null,
        table_name: null,
        elo_affected: Boolean(eloEvent),
      },
      players,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить игру' });
  }
});

export default router;
