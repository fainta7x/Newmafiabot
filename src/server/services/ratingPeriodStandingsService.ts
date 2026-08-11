import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { calculateBestMovePoints } from '../routes/tournamentProtocolRoutes.ts';
import {
  calculateCiRate,
  calculateCiThreshold,
  calculateGameCi,
  normalizeRole,
  roundToTwo,
} from '../utils/ciHelper.ts';

const safeJsonParse = <T,>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const autoIncludesEvening = (period: any, evening: any): boolean => {
  if (!Number(period.auto_include)) return false;
  const periodType = String(period.type || '').toUpperCase();
  const format = normalizeEveningFormat(evening.format);
  if (format !== periodType) return false;
  const eveningTime = new Date(String(evening.starts_at || '')).getTime();
  const start = new Date(String(period.starts_at || '')).getTime();
  const end = new Date(String(period.ends_at || '')).getTime();
  return Number.isFinite(eveningTime) && eveningTime >= start && eveningTime <= end;
};

const booleanOverride = (value: unknown): boolean | null => (
  value === null || value === undefined ? null : Boolean(value)
);

const normalizeWinner = (value: unknown): 'red' | 'black' | null => {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};

type IncludedGame = {
  id: number;
  global_game_number: number;
  game_date: string;
  evening_id: string;
  evening_title: string;
  starts_at: string;
  format: string;
  protocol: any;
  winner_team: 'red' | 'black';
};

const loadIncludedCompletedGames = async (db: DatabaseWrapper, period: any) => {
  const rows = await db.all<any>(`
    SELECT g.id, g.global_game_number, g.game_date, g.protocol_text,
           e.id AS evening_id, e.title AS evening_title, e.starts_at, e.format,
           reo.included AS evening_override_included,
           rgo.included AS game_override_included
      FROM games g
      JOIN game_evenings e ON e.id = g.evening_id
      LEFT JOIN rating_period_evening_overrides reo
        ON reo.period_id = ? AND reo.evening_id = e.id
      LEFT JOIN rating_period_game_overrides rgo
        ON rgo.period_id = ? AND rgo.game_id = g.id
     WHERE g.archived_at IS NULL
     ORDER BY e.starts_at ASC, g.global_game_number ASC, g.id ASC
  `, [period.id, period.id]);

  const included: IncludedGame[] = [];
  let selectedGamesCount = 0;
  const warnings: string[] = [];

  for (const row of rows) {
    const automatic = autoIncludesEvening(period, row);
    const eveningOverride = booleanOverride(row.evening_override_included);
    const gameOverride = booleanOverride(row.game_override_included);
    const effectiveIncluded = gameOverride ?? eveningOverride ?? automatic;
    if (!effectiveIncluded) continue;
    selectedGamesCount += 1;

    const payload = safeJsonParse<any>(row.protocol_text, null);
    if (!payload || payload.version !== 1 || payload.kind !== 'club_evening_protocol' || payload.protocol?.status !== 'completed') {
      continue;
    }
    const winner = normalizeWinner(payload.protocol?.winner_team);
    const results = Array.isArray(payload.player_results) ? payload.player_results : [];
    if (!winner || results.length !== 10) {
      warnings.push(`Игра №${row.global_game_number}: завершённый протокол неполный и не попал в расчёт.`);
      continue;
    }
    const linkedIds = results.map((item: any) => String(item?.player_id || '').trim()).filter(Boolean);
    if (linkedIds.length !== 10 || new Set(linkedIds).size !== 10) {
      warnings.push(`Игра №${row.global_game_number}: не найдены 10 уникальных профилей игроков.`);
      continue;
    }

    included.push({
      id: Number(row.id),
      global_game_number: Number(row.global_game_number),
      game_date: String(row.game_date || row.starts_at || ''),
      evening_id: String(row.evening_id),
      evening_title: String(row.evening_title || 'Игровой вечер'),
      starts_at: String(row.starts_at || row.game_date || ''),
      format: normalizeEveningFormat(row.format),
      protocol: payload,
      winner_team: winner,
    });
  }

  return { games: included, selectedGamesCount, warnings };
};

const createEmptyStats = (player: any) => ({
  place: 0,
  calculated_place: 0,
  player_id: String(player.id),
  nickname: String(player.nickname || 'Игрок'),
  avatar_updated_at: player.avatar_updated_at || null,
  total_points: 0,
  additional_total: 0,
  positive_points: 0,
  positive_judge_points: 0,
  negative_judge_points: 0,
  positive_protocol_points: 0,
  negative_protocol_points: 0,
  game_penalty_points: 0,
  disciplinary_penalty_points: 0,
  penalty_points: 0,
  best_move_points: 0,
  ci_points: 0,
  wins: 0,
  don_wins: 0,
  sheriff_wins: 0,
  first_killed_count: 0,
  games_played: 0,
  games: [] as any[],
  tie_group_id: null as string | null,
});

export async function calculateRatingPeriodStandings(db: DatabaseWrapper, periodId: string) {
  const period = await db.get<any>('SELECT * FROM rating_periods WHERE id = ?', [periodId]);
  if (!period) throw new Error('Рейтинговый период не найден');

  const loaded = await loadIncludedCompletedGames(db, period);
  const completedGames = loaded.games;
  const distanceGames = completedGames.length;
  const thresholdB = calculateCiThreshold(distanceGames);

  if (!distanceGames) {
    return {
      period: { ...period, auto_include: Boolean(period.auto_include) },
      selected_games_count: loaded.selectedGamesCount,
      completed_games_count: 0,
      distance_games: 0,
      ci_threshold_b: 0,
      standings: [],
      tie_groups: [],
      warnings: loaded.warnings,
    };
  }

  const players = await db.all<any>(`
    SELECT p.id, p.nickname,
           (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) AS avatar_updated_at
      FROM players p
  `);
  const playerMap = new Map(players.map((player: any) => [String(player.id), player]));
  const statsMap = new Map<string, ReturnType<typeof createEmptyStats>>();
  const redFirstKilledCounts = new Map<string, number>();

  for (const game of completedGames) {
    const results = game.protocol.player_results as any[];
    const firstKilledParticipantId = String(game.protocol.protocol?.first_killed_participant_id || '');
    if (!firstKilledParticipantId) continue;
    const result = results.find((item: any) => String(item.participant_id || '') === firstKilledParticipantId);
    const playerId = String(result?.player_id || '');
    const role = normalizeRole(result?.role);
    if (playerId && (role === 'citizen' || role === 'sheriff')) {
      redFirstKilledCounts.set(playerId, (redFirstKilledCounts.get(playerId) || 0) + 1);
    }
  }

  const ciRates = new Map<string, number>();
  for (const [playerId, firstKilledCount] of redFirstKilledCounts) {
    ciRates.set(playerId, calculateCiRate(firstKilledCount, thresholdB));
  }

  for (const game of completedGames) {
    const protocol = game.protocol.protocol || {};
    const results = game.protocol.player_results as any[];
    const seats = results.map((item: any) => ({
      participant_id: String(item.participant_id || ''),
      seat_number: Number(item.seat_number),
      role: item.role ?? null,
    }));

    let bestMoves: Array<{ participant_id: string; source: string | null; seat_numbers: number[] }> = [];
    if (Array.isArray(protocol.best_moves) && protocol.best_moves.length) {
      bestMoves = protocol.best_moves.map((move: any) => ({
        participant_id: String(move?.participant_id || ''),
        source: move?.source ? String(move.source) : null,
        seat_numbers: Array.isArray(move?.seat_numbers) ? move.seat_numbers.map(Number).filter(Number.isFinite) : [],
      }));
    } else if (protocol.best_move_participant_id) {
      bestMoves = [{
        participant_id: String(protocol.best_move_participant_id),
        source: protocol.best_move_source ? String(protocol.best_move_source) : null,
        seat_numbers: Array.isArray(protocol.best_move_seats) ? protocol.best_move_seats.map(Number).filter(Number.isFinite) : [],
      }];
    }

    const bestMovePoints = new Map<string, number>();
    for (const move of bestMoves) {
      const points = calculateBestMovePoints(move.seat_numbers, seats).bonusPoints;
      bestMovePoints.set(move.participant_id, roundToTwo((bestMovePoints.get(move.participant_id) || 0) + points));
    }

    const firstKilledParticipantId = String(protocol.first_killed_participant_id || '');
    const firstKilledBestMove = bestMoves.find((move) => move.source === 'first_killed' && move.participant_id === firstKilledParticipantId) || null;
    const hasBlackInFirstKilledBestMove = Boolean(firstKilledBestMove?.seat_numbers.some((seatNumber) => {
      const seat = seats.find((item) => Number(item.seat_number) === Number(seatNumber));
      const role = normalizeRole(seat?.role);
      return role === 'mafia' || role === 'don';
    }));

    for (const result of results) {
      const playerId = String(result?.player_id || '').trim();
      const participantId = String(result?.participant_id || '').trim();
      if (!playerId || !participantId) continue;
      const player = playerMap.get(playerId) || { id: playerId, nickname: result?.display_name || 'Игрок', avatar_updated_at: null };
      if (!statsMap.has(playerId)) statsMap.set(playerId, createEmptyStats(player));
      const stats = statsMap.get(playerId)!;

      const role = normalizeRole(result?.role);
      const judgeBonus = Number(result?.judge_bonus || 0);
      const protocolBonus = Number(result?.protocol_bonus || 0);
      const disciplinaryPenalty = Number(result?.disciplinary_penalty_points || 0);
      const positiveJudge = Math.max(judgeBonus, 0);
      const negativeJudge = Math.max(-judgeBonus, 0);
      const positiveProtocol = Math.max(protocolBonus, 0);
      const negativeProtocol = Math.max(-protocolBonus, 0);
      const positivePoints = roundToTwo(positiveJudge + positiveProtocol);
      const gamePenaltyPoints = roundToTwo(negativeJudge + negativeProtocol);
      const bestMove = roundToTwo(bestMovePoints.get(participantId) || 0);
      const disciplinaryPoints = roundToTwo(disciplinaryPenalty);

      let winPoint = 0;
      if (game.winner_team === 'red' && (role === 'citizen' || role === 'sheriff')) winPoint = 1;
      if (game.winner_team === 'black' && (role === 'mafia' || role === 'don')) winPoint = 1;

      const playerRate = ciRates.get(playerId) || 0;
      const ciResult = calculateGameCi({
        isFirstKilled: firstKilledParticipantId === participantId,
        role: result?.role ?? null,
        winnerTeam: game.winner_team,
        bestMoveParticipantId: firstKilledBestMove?.participant_id || null,
        participantId,
        hasBlackInBestMove: hasBlackInFirstKilledBestMove,
        playerRate,
      });
      const gameCi = ciResult.gameCi;
      const additionalGame = roundToTwo(positivePoints + bestMove - disciplinaryPoints - gamePenaltyPoints);
      const gameTotal = roundToTwo(winPoint + additionalGame + gameCi);

      stats.games_played += 1;
      stats.wins += winPoint;
      if (winPoint === 1 && role === 'don') stats.don_wins += 1;
      if (winPoint === 1 && role === 'sheriff') stats.sheriff_wins += 1;
      if (firstKilledParticipantId === participantId) stats.first_killed_count += 1;
      stats.positive_judge_points = roundToTwo(stats.positive_judge_points + positiveJudge);
      stats.negative_judge_points = roundToTwo(stats.negative_judge_points + negativeJudge);
      stats.positive_protocol_points = roundToTwo(stats.positive_protocol_points + positiveProtocol);
      stats.negative_protocol_points = roundToTwo(stats.negative_protocol_points + negativeProtocol);
      stats.positive_points = roundToTwo(stats.positive_points + positivePoints);
      stats.best_move_points = roundToTwo(stats.best_move_points + bestMove);
      stats.game_penalty_points = roundToTwo(stats.game_penalty_points + gamePenaltyPoints);
      stats.disciplinary_penalty_points = roundToTwo(stats.disciplinary_penalty_points + disciplinaryPoints);
      stats.penalty_points = roundToTwo(stats.game_penalty_points + stats.disciplinary_penalty_points);
      stats.ci_points = roundToTwo(stats.ci_points + gameCi);
      stats.additional_total = roundToTwo(stats.additional_total + additionalGame);
      stats.total_points = roundToTwo(stats.total_points + gameTotal);
      stats.games.push({
        game_id: game.id,
        game_number: game.global_game_number,
        evening_id: game.evening_id,
        evening_title: game.evening_title,
        game_date: game.game_date,
        seat_number: Number(result?.seat_number),
        role: result?.role ?? null,
        winner_team: game.winner_team,
        win_point: winPoint,
        judge_bonus: judgeBonus,
        protocol_bonus: protocolBonus,
        positive_points: positivePoints,
        best_move_points: bestMove,
        game_penalty_points: gamePenaltyPoints,
        disciplinary_penalty_points: disciplinaryPoints,
        penalty_points: roundToTwo(gamePenaltyPoints + disciplinaryPoints),
        ci_points: gameCi,
        ci_rate: playerRate,
        ci_reason: ciResult.ciReason,
        game_total: gameTotal,
      });
    }
  }

  const standings = Array.from(statsMap.values());
  for (const item of standings) {
    item.ci_calculation = {
      distance_games: distanceGames,
      threshold_b: thresholdB,
      first_killed_count: redFirstKilledCounts.get(item.player_id) || 0,
      ci_rate: ciRates.get(item.player_id) || 0,
      provisional: String(period.status) !== 'completed',
    } as any;
  }

  standings.sort((a, b) => {
    if (Math.abs(b.total_points - a.total_points) > 0.0001) return b.total_points - a.total_points;
    if (Math.abs(b.additional_total - a.additional_total) > 0.0001) return b.additional_total - a.additional_total;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const specialWinsB = b.don_wins + b.sheriff_wins;
    const specialWinsA = a.don_wins + a.sheriff_wins;
    if (specialWinsB !== specialWinsA) return specialWinsB - specialWinsA;
    if (b.first_killed_count !== a.first_killed_count) return b.first_killed_count - a.first_killed_count;
    const byName = a.nickname.localeCompare(b.nickname, 'ru');
    return byName || a.player_id.localeCompare(b.player_id);
  });

  for (let index = 0; index < standings.length; index += 1) {
    if (!index) standings[index].calculated_place = 1;
    else {
      const current = standings[index];
      const previous = standings[index - 1];
      const equal = Math.abs(current.total_points - previous.total_points) < 0.0001
        && Math.abs(current.additional_total - previous.additional_total) < 0.0001
        && current.wins === previous.wins
        && (current.don_wins + current.sheriff_wins) === (previous.don_wins + previous.sheriff_wins)
        && current.first_killed_count === previous.first_killed_count;
      current.calculated_place = equal ? previous.calculated_place : index + 1;
    }
    standings[index].place = standings[index].calculated_place;
  }

  const tieGroups: Array<{ tie_group_id: string; player_ids: string[] }> = [];
  const grouped = new Map<string, string[]>();
  for (const item of standings) {
    const key = `${item.total_points}_${item.additional_total}_${item.wins}_${item.don_wins + item.sheriff_wins}_${item.first_killed_count}`;
    const ids = grouped.get(key) || [];
    ids.push(item.player_id);
    grouped.set(key, ids);
  }
  for (const [key, playerIds] of grouped) {
    if (playerIds.length < 2) continue;
    const tieGroupId = `rp_${key.replace(/\./g, '_')}`;
    tieGroups.push({ tie_group_id: tieGroupId, player_ids: playerIds });
    for (const playerId of playerIds) {
      const row = standings.find((item) => item.player_id === playerId);
      if (row) row.tie_group_id = tieGroupId;
    }
  }

  return {
    period: { ...period, auto_include: Boolean(period.auto_include) },
    selected_games_count: loaded.selectedGamesCount,
    completed_games_count: distanceGames,
    distance_games: distanceGames,
    ci_threshold_b: thresholdB,
    standings,
    tie_groups: tieGroups,
    warnings: loaded.warnings,
  };
}
