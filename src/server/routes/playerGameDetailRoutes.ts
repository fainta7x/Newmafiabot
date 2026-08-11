import { Router } from 'express';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';
import { getPlayerSessionId } from '../auth.ts';
import { loadPlayerEloHistory, type PlayerEloHistoryEvent } from '../services/playerEloHistoryService.ts';

const router = Router();

type GameSource = 'club' | 'tournament';
type Team = 'red' | 'black' | null;
type CanonicalRole = 'citizen' | 'sheriff' | 'mafia' | 'don' | null;

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const safeJsonParse = <T = any>(value: unknown, fallback: T | null = null): T | null => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const normalizeRole = (role: unknown): CanonicalRole => {
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

const roundToTwo = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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

const bestMovePoints = (seatNumbers: number[], roleBySeat: Map<number, CanonicalRole>) => {
  let guessedBlacks = 0;
  for (const seat of seatNumbers) {
    const role = roleBySeat.get(Number(seat));
    if (role === 'mafia' || role === 'don') guessedBlacks += 1;
  }
  if (guessedBlacks >= 3) return 0.6;
  if (guessedBlacks === 2) return 0.3;
  if (guessedBlacks === 1) return 0.1;
  return 0;
};

const normalizedSeats = (value: unknown): number[] => (
  Array.isArray(value)
    ? value.map(Number).filter((seat) => Number.isInteger(seat) && seat >= 1 && seat <= 10)
    : []
);

const normalizeVotes = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((round: any, index: number) => ({
    round_number: numeric(round?.round_number) || index + 1,
    day_number: round?.day_number == null ? (index === 0 ? 0 : 1) : numeric(round.day_number),
    is_revote: Boolean(round?.is_revote),
    parent_round_number: round?.parent_round_number == null ? null : numeric(round.parent_round_number),
    eligible_voters: round?.eligible_voters == null ? null : numeric(round.eligible_voters),
    nominated_seats: normalizedSeats(round?.nominated_seats),
    vote_counts: typeof round?.vote_counts === 'object' && round.vote_counts && !Array.isArray(round.vote_counts)
      ? Object.fromEntries(Object.entries(round.vote_counts).map(([seat, count]) => [String(seat), numeric(count)]))
      : {},
    outcome: round?.outcome ? String(round.outcome) : null,
  }));
};

const normalizeShots = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((shot: any, index: number) => ({
    night_number: numeric(shot?.night_number) || index + 1,
    target_seat: numeric(shot?.target_seat),
    result: shot?.result ? String(shot.result) : null,
  }));
};

const normalizeColorProtocol = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: any) => {
    const mark = String(entry?.mark || '').trim();
    if (!mark) return [];
    return [{ mark, seat_numbers: normalizedSeats(entry?.seat_numbers) }];
  });
};

const normalizeReplacement = (value: unknown) => {
  if (!value || typeof value !== 'object') return null;
  return value;
};

const buildScore = ({
  won,
  judgeBonus,
  protocolBonus,
  ciPoints,
  bestMove,
  disciplinaryPenalty,
}: {
  won: boolean;
  judgeBonus: number;
  protocolBonus: number;
  ciPoints: number;
  bestMove: number;
  disciplinaryPenalty: number;
}) => {
  const winPoint = won ? 1 : 0;
  const total = winPoint + judgeBonus + protocolBonus + ciPoints + bestMove - disciplinaryPenalty;
  return {
    win_point: winPoint,
    judge_bonus: roundToTwo(judgeBonus),
    protocol_bonus: roundToTwo(protocolBonus),
    ci_points: roundToTwo(ciPoints),
    best_move_points: roundToTwo(bestMove),
    disciplinary_penalty_points: roundToTwo(disciplinaryPenalty),
    total_points: roundToTwo(total),
  };
};

const participantInfo = (
  participantId: string | null,
  players: Array<{ participant_id: string; seat_number: number; nickname: string }>,
) => {
  if (!participantId) return null;
  const item = players.find((player) => player.participant_id === participantId);
  return item ? { participant_id: item.participant_id, seat_number: item.seat_number, nickname: item.nickname } : null;
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

      const payload = safeJsonParse<any>(row.protocol_text);
      const protocol = payload?.protocol || {};
      if (!payload || payload.kind !== 'club_evening_protocol' || protocol.status !== 'completed') {
        return res.status(409).json({ error: 'Игра ещё не завершена' });
      }

      const winnerTeam = normalizeWinner(protocol.winner_team || row.winner_team);
      const playersById = await playerRowsById(db);
      const firstKilledId = String(protocol.first_killed_participant_id || '');
      const zeroRoundVotedId = String(protocol.zero_round_voted_participant_id || '');
      const ppkCulpritId = String(protocol.ppk_culprit_participant_id || '');
      const results = Array.isArray(payload.player_results) ? payload.player_results : [];
      const roleBySeat = new Map<number, CanonicalRole>(
        results.map((result: any) => [numeric(result?.seat_number), normalizeRole(result?.role)]),
      );
      const modernBestMoves = Array.isArray(protocol.best_moves) ? protocol.best_moves : [];
      const legacyBestMove = protocol.best_move_participant_id
        ? [{
          participant_id: protocol.best_move_participant_id,
          source: protocol.best_move_source || null,
          seat_numbers: protocol.best_move_seats || [],
        }]
        : [];
      const bestMoves = (modernBestMoves.length ? modernBestMoves : legacyBestMove).map((move: any) => ({
        participant_id: String(move?.participant_id || ''),
        source: move?.source ? String(move.source) : null,
        seat_numbers: normalizedSeats(move?.seat_numbers),
      }));

      const participantDirectory = results.map((result: any) => {
        const playerId = String(result?.player_id || '').trim() || null;
        const player = playerId ? playersById.get(playerId) : null;
        return {
          participant_id: String(result?.participant_id || ''),
          seat_number: numeric(result?.seat_number),
          nickname: player?.nickname || result?.display_name || 'Игрок',
        };
      });

      const players = results.map((result: any) => {
        const playerId = String(result?.player_id || '').trim() || null;
        const participantId = String(result?.participant_id || '').trim();
        const player = playerId ? playersById.get(playerId) : null;
        const role = normalizeRole(result?.role);
        const team = teamFromRole(role);
        const won = Boolean(team && winnerTeam && team === winnerTeam);
        const elo = eloForPlayer(eloEvent, playerId);
        const bestMove = bestMoves.find((move) => move.participant_id === participantId) || null;
        const bestMoveSeatNumbers = bestMove?.seat_numbers || [];
        const bestMoveBonus = bestMovePoints(bestMoveSeatNumbers, roleBySeat);
        const regularFouls = numeric(result?.regular_fouls);
        const minorTechnicalFouls = numeric(result?.minor_technical_fouls);
        const majorTechnicalFouls = numeric(result?.major_technical_fouls);
        const disciplinaryPenalty = calculateDisciplinaryPenalty(
          minorTechnicalFouls,
          majorTechnicalFouls,
          result?.exit_type === 'removed',
          participantId === ppkCulpritId,
        );
        const judgeBonus = numeric(result?.judge_bonus);
        const protocolBonus = numeric(result?.protocol_bonus);
        const ciPoints = numeric(result?.ci_points);

        return {
          player_id: playerId,
          participant_id: participantId,
          nickname: player?.nickname || result?.display_name || 'Игрок',
          avatar_url: playerId && player
            ? playerAvatarUrl(playerId, player.has_db_avatar, player.avatar_suppressed)
            : null,
          seat_number: numeric(result?.seat_number),
          role,
          team,
          won,
          exit_type: result?.exit_type || null,
          exit_order: result?.exit_order == null ? null : numeric(result.exit_order),
          regular_fouls: regularFouls,
          minor_technical_fouls: minorTechnicalFouls,
          major_technical_fouls: majorTechnicalFouls,
          removal_reason: result?.removal_reason || null,
          notes: result?.notes || null,
          color_protocol: normalizeColorProtocol(result?.color_protocol),
          judge_bonus: judgeBonus,
          protocol_bonus: protocolBonus,
          ci_points: ciPoints,
          penalty_points: numeric(result?.penalty_points),
          disciplinary_penalty_points: roundToTwo(disciplinaryPenalty),
          first_killed: participantId === firstKilledId,
          zero_round_voted: participantId === zeroRoundVotedId,
          best_move: Boolean(bestMove),
          best_move_source: bestMove?.source || null,
          best_move_seats: bestMoveSeatNumbers,
          score: buildScore({ won, judgeBonus, protocolBonus, ciPoints, bestMove: bestMoveBonus, disciplinaryPenalty }),
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
        protocol: {
          end_reason: protocol.end_reason || 'normal',
          votes: normalizeVotes(protocol.votes),
          shots: normalizeShots(protocol.shots),
          replacement: normalizeReplacement(protocol.replacement),
          judge_notes: protocol.judge_notes || null,
          first_killed: participantInfo(firstKilledId || null, participantDirectory),
          zero_round_voted: participantInfo(zeroRoundVotedId || null, participantDirectory),
          ppk_culprit: participantInfo(ppkCulpritId || null, participantDirectory),
        },
        players,
      });
    }

    const game = await db.get(`
      SELECT tg.id, tg.game_number, tg.judge_name, tg.completed_at,
             COALESCE(tgp.winner_team, tg.winner_team) AS winner_team,
             t.title AS tournament_title, t.date AS tournament_date,
             tgp.votes_json, tgp.shots_json, tgp.replacement_json, tgp.judge_notes,
             tgp.end_reason, tgp.first_killed_participant_id, tgp.zero_round_voted_participant_id,
             tgp.ppk_culprit_participant_id
        FROM tournament_games tg
        JOIN tournaments t ON t.id = tg.tournament_id
   LEFT JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
       WHERE tg.id = ? AND tg.status = 'completed'
       LIMIT 1
    `, [parsed.sourceId]);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });

    const winnerTeam = normalizeWinner(game.winner_team);
    const rows = await db.all(`
      SELECT tp.id AS participant_id, p.id AS player_id, COALESCE(p.nickname, tp.display_name) AS nickname,
             tgs.seat_number, tgs.role,
             tgpr.exit_type, tgpr.exit_order, tgpr.regular_fouls, tgpr.minor_technical_fouls,
             tgpr.major_technical_fouls, tgpr.judge_bonus, tgpr.protocol_bonus,
             tgpr.ci_points, tgpr.penalty_points, tgpr.disciplinary_penalty_points,
             tgpr.color_protocol_json, tgpr.removal_reason, tgpr.notes,
             (SELECT tgbm.source FROM tournament_game_best_moves tgbm
               WHERE tgbm.game_id = tgs.game_id AND tgbm.participant_id = tp.id LIMIT 1) AS best_move_source,
             (SELECT tgbm.seat_numbers_json FROM tournament_game_best_moves tgbm
               WHERE tgbm.game_id = tgs.game_id AND tgbm.participant_id = tp.id LIMIT 1) AS best_move_seats_json,
             EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
             EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
   LEFT JOIN players p ON p.id = tp.player_id
   LEFT JOIN tournament_game_player_results tgpr
          ON tgpr.game_id = tgs.game_id AND tgpr.participant_id = tp.id
       WHERE tgs.game_id = ?
       ORDER BY tgs.seat_number ASC
    `, [parsed.sourceId]);

    const roleBySeat = new Map<number, CanonicalRole>(
      rows.map((row: any) => [numeric(row.seat_number), normalizeRole(row.role)]),
    );
    const participantDirectory = rows.map((row: any) => ({
      participant_id: String(row.participant_id || ''),
      seat_number: numeric(row.seat_number),
      nickname: row.nickname || 'Игрок',
    }));
    const ppkCulpritId = String(game.ppk_culprit_participant_id || '');

    const players = rows.map((row: any) => {
      const playerId = row.player_id ? String(row.player_id) : null;
      const participantId = String(row.participant_id || '');
      const role = normalizeRole(row.role);
      const team = teamFromRole(role);
      const won = Boolean(team && winnerTeam && team === winnerTeam);
      const elo = eloForPlayer(eloEvent, playerId);
      const bestMoveSeats = normalizedSeats(safeJsonParse<any[]>(row.best_move_seats_json, []) || []);
      const bestMoveBonus = bestMovePoints(bestMoveSeats, roleBySeat);
      const regularFouls = numeric(row.regular_fouls);
      const minorTechnicalFouls = numeric(row.minor_technical_fouls);
      const majorTechnicalFouls = numeric(row.major_technical_fouls);
      const disciplinaryPenalty = calculateDisciplinaryPenalty(
        minorTechnicalFouls,
        majorTechnicalFouls,
        row.exit_type === 'removed',
        participantId === ppkCulpritId,
      );
      const judgeBonus = numeric(row.judge_bonus);
      const protocolBonus = numeric(row.protocol_bonus);
      const ciPoints = numeric(row.ci_points);

      return {
        player_id: playerId,
        participant_id: participantId,
        nickname: row.nickname || 'Игрок',
        avatar_url: playerId
          ? playerAvatarUrl(playerId, row.has_db_avatar, row.avatar_suppressed)
          : null,
        seat_number: numeric(row.seat_number),
        role,
        team,
        won,
        exit_type: row.exit_type || null,
        exit_order: row.exit_order == null ? null : numeric(row.exit_order),
        regular_fouls: regularFouls,
        minor_technical_fouls: minorTechnicalFouls,
        major_technical_fouls: majorTechnicalFouls,
        removal_reason: row.removal_reason || null,
        notes: row.notes || null,
        color_protocol: normalizeColorProtocol(safeJsonParse<any[]>(row.color_protocol_json, []) || []),
        judge_bonus: judgeBonus,
        protocol_bonus: protocolBonus,
        ci_points: ciPoints,
        penalty_points: numeric(row.penalty_points),
        disciplinary_penalty_points: roundToTwo(disciplinaryPenalty),
        first_killed: participantId === String(game.first_killed_participant_id || ''),
        zero_round_voted: participantId === String(game.zero_round_voted_participant_id || ''),
        best_move: Boolean(row.best_move_source),
        best_move_source: row.best_move_source || null,
        best_move_seats: bestMoveSeats,
        score: buildScore({ won, judgeBonus, protocolBonus, ciPoints, bestMove: bestMoveBonus, disciplinaryPenalty }),
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
      protocol: {
        end_reason: game.end_reason || 'normal',
        votes: normalizeVotes(safeJsonParse<any[]>(game.votes_json, []) || []),
        shots: normalizeShots(safeJsonParse<any[]>(game.shots_json, []) || []),
        replacement: normalizeReplacement(safeJsonParse<any>(game.replacement_json, null)),
        judge_notes: game.judge_notes || null,
        first_killed: participantInfo(String(game.first_killed_participant_id || '') || null, participantDirectory),
        zero_round_voted: participantInfo(String(game.zero_round_voted_participant_id || '') || null, participantDirectory),
        ppk_culprit: participantInfo(ppkCulpritId || null, participantDirectory),
      },
      players,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить игру' });
  }
});

export default router;
