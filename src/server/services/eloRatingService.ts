import type { DatabaseWrapper } from '../../db/index.ts';
import { DEFAULT_ELO_SEED } from '../../db/ensureEloSeedSchema.ts';
import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';
import { eveningFormatAffectsElo } from '../../lib/eveningFormat.ts';
import { gameTeamOfRole, normalizeWinnerTeam } from '../../shared/gameRoles.ts';
import { clubBestMovePointsForParticipant } from './bestMovePoints.ts';
import { gameContribution } from '../../lib/playerContribution.ts';
import { ELO_CONTRIBUTION_CAP, ELO_DISCIPLINE_POINT_WEIGHT, ELO_PERSONAL_CAP, ELO_PERSONAL_POINT_WEIGHT } from '../../shared/eloWeights.ts';


export const DEFAULT_ELO = DEFAULT_ELO_SEED;
export type EloTeam = 'red' | 'black';

export interface CanonicalEloGamePlayer {
  playerId: string;
  team: EloTeam;
  elo: number;
  canonicalPersonalGamePoints: number;
  /** Positive discipline points already deducted inside canonicalPersonalGamePoints; kept separately to preserve their price. */
  disciplinaryPenaltyPoints?: number;
  /** Discipline charged in Elo, when it differs from the sporting points (club: removal 0.75 = −30, owner 2026-10-26). */
  eloDisciplinePoints?: number;
  /** Individual contribution in points (club games only), with no role-average subtraction. */
  contributionPoints?: number;
  personalPositivePoints?: number;
  personalNegativePoints?: number;
  contributionPositivePoints?: number;
  contributionNegativePoints?: number;
  /** Positive fixed deduction in Elo, after all personal limits. */
  missPenaltyElo?: number;
}

export interface CanonicalEloPlayerDelta {
  playerId: string;
  expectedTeamResult: number;
  resultDelta: number;
  carryModifier: number;
  modifiedResultDelta: number;
  personalDelta: number;
  contributionDelta: number;
  personalCapDelta: number;
  disciplinaryDelta: number;
  missDelta?: number;
  totalDelta: number;
}

export type EloContribution = { role: string; raw: number; positive?: number; negative?: number; missPenaltyElo?: number };
export type PreparedEloPlayer = Omit<CanonicalEloGamePlayer, 'elo'> & { contribution?: EloContribution };
export type PreparedEloEvent = {
  source: 'tournament' | 'club';
  sourceId: string;
  sortAt: string;
  sortOrder: number;
  winnerTeam: EloTeam;
  players: PreparedEloPlayer[];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const numeric = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The Elo scale (owner, 2026-10-01): the result and disciplinary scale retain ×5 units. The personal-point
 * weight was independently reduced by the owner-approved 2026-10-25 balance review.
 * Expectation and protection use their own documented level distances.
 */
export const ELO_SCALE = 5;
const RESULT_WEIGHT = 10 * ELO_SCALE;
const PERSONAL_POINT_WEIGHT = ELO_PERSONAL_POINT_WEIGHT;
export const PERSONAL_CAP_ELO = ELO_PERSONAL_CAP;
/**
 * Table level (owner, 2026-10-24: «в пределах 150 Elo уровень одинаковый, от 150 до 250 уровень сильно различается, от 250 огромная
 * разница»). A gap between two averages is first turned into an effective level gap. The win expectation is bounded separately by expectedRedTeamResult; the same effective gap drives protection:
 *  - up to 150 Elo the levels are the same (no effect);
 *  - 150–250: the effect grows one-for-one (0…100);
 *  - above 250: «huge», the effect grows twice as fast, up to 300 (gap 350 and more is the same);
 * The distances are not stretched ×5; the game weight stays 50, while personal and discipline weights are independent.
 */
export const SAME_LEVEL_GAP = 150;
export const STRONG_LEVEL_GAP = 250;
const MAX_LEVEL_EFFECT = 300;
export const EXPECTATION_DIVISOR = 200;
export const PROTECTION_DIVISOR = 200;
export const levelGap = (gap: number): number => {
  const size = Math.abs(gap);
  if (size <= SAME_LEVEL_GAP) return 0;
  const effect = size <= STRONG_LEVEL_GAP
    ? size - SAME_LEVEL_GAP
    : (STRONG_LEVEL_GAP - SAME_LEVEL_GAP) + 2 * (size - STRONG_LEVEL_GAP);
  return Math.sign(gap) * Math.min(MAX_LEVEL_EFFECT, effect);
};

export const RED_EQUAL_EXPECTATION = 0.30;
export const RED_MAX_EXPECTATION = 0.60;
export const BLACK_MAX_EXPECTATION = 0.90;

/**
 * Owner, 2026-10-25: even overwhelmingly stronger reds win only about 55–60% of games.
 * Smoothly saturate their advantage within that range; at the largest effective gap the expectation is about 57%.
 * Owner's next answer: overwhelmingly stronger blacks may win about 90%, so the opposite branch
 * smoothly reaches that ceiling at the largest effective gap.
 * This conversion is independent of the strong-player protection below.
 */
export function expectedRedTeamResult(teamAverageGap: number): number {
  const effect = levelGap(teamAverageGap);
  if (effect >= 0) return RED_EQUAL_EXPECTATION
    + (RED_MAX_EXPECTATION - RED_EQUAL_EXPECTATION) * Math.tanh(effect / EXPECTATION_DIVISOR);
  const redMin = 1 - BLACK_MAX_EXPECTATION;
  const disadvantage = Math.tanh(-effect / EXPECTATION_DIVISOR) / Math.tanh(MAX_LEVEL_EFFECT / EXPECTATION_DIVISOR);
  return Math.max(redMin, RED_EQUAL_EXPECTATION - (RED_EQUAL_EXPECTATION - redMin) * disadvantage);
}

export function calculateCanonicalEloGame(players: CanonicalEloGamePlayer[], winnerTeam: EloTeam): CanonicalEloPlayerDelta[] {
  const redPlayers = players.filter((player) => player.team === 'red');
  const blackPlayers = players.filter((player) => player.team === 'black');
  if (!redPlayers.length || !blackPlayers.length) throw new Error('Canonical Elo requires both red and black teams.');
  const redTeamAvg = average(redPlayers.map((player) => player.elo));
  const blackTeamAvg = average(blackPlayers.map((player) => player.elo));
  const pRed = expectedRedTeamResult(redTeamAvg - blackTeamAvg);
  const pBlack = 1 - pRed;
  return players.map((player) => {
    const teamPlayers = player.team === 'red' ? redPlayers : blackPlayers;
    const allies = teamPlayers.filter((ally) => ally.playerId !== player.playerId);
    const allyAvgExcludingSelf = allies.length ? average(allies.map((ally) => ally.elo)) : player.elo;
    const n = clamp(levelGap(player.elo - allyAvgExcludingSelf) / PROTECTION_DIVISOR, -1, 1);
    const won = player.team === winnerTeam;
    let carryModifier: number;
    if (won) carryModifier = n > 0 ? 1 + 0.30 * n : 1 - 0.20 * Math.abs(n);
    else carryModifier = n > 0 ? 1 - 0.40 * n : 1;
    const expectedTeamResult = player.team === 'red' ? pRed : pBlack;
    const actualResult = won ? 1 : 0;
    const resultDelta = RESULT_WEIGHT * (actualResult - expectedTeamResult);
    const modifiedResultDelta = resultDelta * carryModifier;
    const disciplinePoints = Math.max(0, numeric(player.disciplinaryPenaltyPoints));
    const personalDelta = (player.canonicalPersonalGamePoints + disciplinePoints) * PERSONAL_POINT_WEIGHT;
    const contributionDelta = (player.contributionPoints || 0) * PERSONAL_POINT_WEIGHT;
    const personalSum = personalDelta + contributionDelta;
    const positive = (player.personalPositivePoints ?? Math.max(0, personalDelta / PERSONAL_POINT_WEIGHT))
      + (player.contributionPositivePoints ?? Math.max(0, numeric(player.contributionPoints)));
    const negative = (player.personalNegativePoints ?? Math.min(0, personalDelta / PERSONAL_POINT_WEIGHT))
      + (player.contributionNegativePoints ?? Math.min(0, numeric(player.contributionPoints)));
    const awardedPersonal = Math.max(-PERSONAL_CAP_ELO, Math.min(PERSONAL_CAP_ELO, positive * PERSONAL_POINT_WEIGHT) + negative * PERSONAL_POINT_WEIGHT);
    const personalCapDelta = awardedPersonal - personalSum;
    const missDelta = -Math.max(0, numeric(player.missPenaltyElo));
    const disciplinaryDelta = -Math.max(0, numeric(player.eloDisciplinePoints ?? disciplinePoints)) * ELO_DISCIPLINE_POINT_WEIGHT;
    return { playerId: player.playerId, expectedTeamResult, resultDelta, carryModifier, modifiedResultDelta,
      personalDelta, contributionDelta, personalCapDelta, missDelta, disciplinaryDelta,
      totalDelta: modifiedResultDelta + awardedPersonal + missDelta + disciplinaryDelta };
  });
}

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

/** Elo personal points: manual judge, LH and Ci, minus discipline; protocol sporting points are excluded. */
export const clubDisciplinaryPenaltyPoints = (payload: any, result: any): number => {
  const participantId = String(result?.participant_id || '');
  const isPpkCulprit = payload?.protocol?.end_reason === 'ppk' && participantId && participantId === String(payload?.protocol?.ppk_culprit_participant_id || '');
  return calculateDisciplinaryPenalty(
    Math.max(0, Math.trunc(numeric(result?.minor_technical_fouls))),
    Math.max(0, Math.trunc(numeric(result?.major_technical_fouls))),
    result?.exit_type === 'removed',
    Boolean(isPpkCulprit),
  );
};

/**
 * Discipline in club Elo (owner, 2026-10-26): technical foul −12, gross technical −24, removal −30, PPK −40.
 * The sporting points keep their own scale (`calculateDisciplinaryPenalty`); only Elo uses removal 0.75.
 */
export const ELO_REMOVAL_POINTS = 0.75;
export const clubEloDisciplinePoints = (payload: any, result: any): number => {
  const participantId = String(result?.participant_id || '');
  const isPpkCulprit = payload?.protocol?.end_reason === 'ppk' && participantId && participantId === String(payload?.protocol?.ppk_culprit_participant_id || '');
  return Math.max(0, Math.trunc(numeric(result?.minor_technical_fouls))) * 0.3
    + Math.max(0, Math.trunc(numeric(result?.major_technical_fouls))) * 0.6
    // PPK costs 40 on its own; it is not stacked with the removal that usually comes with it.
    + (isPpkCulprit ? 1 : result?.exit_type === 'removed' ? ELO_REMOVAL_POINTS : 0);
};

export const clubPersonalGamePoints = (payload: any, result: any, results: any[]): number => {
  const participantId = String(result?.participant_id || '');
  return numeric(result?.judge_bonus) + clubBestMovePointsForParticipant(payload?.protocol, participantId, results) + numeric(result?.ci_points) - clubDisciplinaryPenaltyPoints(payload, result);
};

const splitPersonalPoints = (values: number[]) => ({
  personalPositivePoints: values.reduce((sum, value) => sum + Math.max(0, value), 0),
  personalNegativePoints: values.reduce((sum, value) => sum + Math.min(0, value), 0),
});
export const clubPersonalPointParts = (payload: any, result: any, results: any[]) => splitPersonalPoints([
  numeric(result?.judge_bonus), clubBestMovePointsForParticipant(payload?.protocol, String(result?.participant_id || ''), results), numeric(result?.ci_points),
]);

/** Sporting protocol points remain in standings; Elo evaluates the recorded colours once instead. */
export const tournamentPersonalEloPoints = (game: any) => {
  const disciplinaryPenaltyPoints = Math.max(0, numeric(game?.disciplinary_penalty_points));
  const canonicalPersonalGamePoints = numeric(game?.game_total) - numeric(game?.win_point) - numeric(game?.protocol_bonus);
  const values = [numeric(game?.judge_bonus), numeric(game?.best_move_points), numeric(game?.ci_points), -numeric(game?.game_penalty_points)];
  // Preserve the canonical net, including rounding/legacy components absent from an older standings fixture.
  values.push(canonicalPersonalGamePoints + disciplinaryPenaltyPoints - values.reduce((sum, value) => sum + value, 0));
  return { canonicalPersonalGamePoints, disciplinaryPenaltyPoints, ...splitPersonalPoints(values) };
};

/**
 * Individual contribution (owner, 2026-10-25): an addition to the result, never a replacement. Points come from the game's
 * own facts (`playerContribution.ts`); every found black is praised, no role adjustment (the weights balance the roles);
 * positive personal awards are capped at35 before errors; the personal floor is−35 and misses are separate; it accumulates without a ceiling — a player who keeps playing well keeps rising.
 */
export const CONTRIBUTION_CAP_ELO = ELO_CONTRIBUTION_CAP;
export const clubContributionByPlayer = (payload: any, results: any[], mode: 'club' | 'wills' = 'club'): Map<string, EloContribution> => {
  const bySeat = new Map(gameContribution(payload, mode).map((item) => [item.seat, item]));
  const out = new Map<string, EloContribution>();
  for (const result of results) {
    const playerId = String(result?.player_id || '').trim();
    const item = bySeat.get(Number(result?.seat_number));
    if (playerId && item?.role) out.set(playerId, { role: item.role, raw: item.points, positive: item.positivePoints, negative: item.negativePoints, missPenaltyElo: item.missPenaltyElo });
  }
  return out;
};
export const normalizeContributions = (events: PreparedEloEvent[]) => {
  for (const event of events) for (const player of event.players) {
    if (player.contribution) {
      player.contributionPoints = player.contribution.raw;
      player.contributionPositivePoints = player.contribution.positive ?? Math.max(0, player.contribution.raw);
      player.contributionNegativePoints = player.contribution.negative ?? Math.min(0, player.contribution.raw);
      player.missPenaltyElo = player.contribution.missPenaltyElo ?? player.missPenaltyElo;
    }
  }
};

/** Shared by the rebuild and history: only tournament will colours are added, not the club vote/check scoring. */
export async function tournamentWillContributions(db: DatabaseWrapper, game: any, winner: EloTeam, standings: any[]) {
  const [protocolRow, rawResults, bestMoves] = await Promise.all([
    db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ? LIMIT 1', [game.id]),
    db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [game.id]),
    db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [game.id]),
  ]);
  const byParticipant = new Map(rawResults.map((row: any) => [String(row.participant_id), row]));
  const results = standings.flatMap((participant: any) => {
    const canonical = Array.isArray(participant.games) ? participant.games.find((item: any) => Number(item.game_number) === Number(game.game_number)) : null;
    if (!canonical) return [];
    const raw: any = byParticipant.get(String(participant.participant_id)) || {};
    return [{ ...raw, participant_id: participant.participant_id, player_id: participant.player_id, seat_number: canonical.seat_number, role: canonical.role,
      color_protocol: safeJsonParse<any[]>(raw.color_protocol_json, []) }];
  });
  const protocol = { ...protocolRow, winner_team: winner,
    events: safeJsonParse<any[]>(protocolRow?.events_json, []), shots: safeJsonParse<any[]>(protocolRow?.shots_json ?? game.shots_json, []),
    best_move_seats: safeJsonParse<any[]>(protocolRow?.best_move_seats_json, []),
    best_moves: bestMoves.map((move: any) => ({ ...move, seat_numbers: safeJsonParse<any[]>(move.seat_numbers_json, []) })),
  };
  return clubContributionByPlayer({ protocol, player_results: results }, results, 'wills');
}

export const sortTime = (value: string) => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

/** `guests` are the seats of guests without a profile: they are left out of the rating, so fewer players are expected. */
export const validatePreparedEvent = (event: PreparedEloEvent, guests: { red: number; black: number } = { red: 0, black: 0 }) => {
  const expected = 10 - guests.red - guests.black;
  if (event.players.length !== expected || new Set(event.players.map((player) => player.playerId)).size !== expected) {
    throw new Error(`Canonical Elo cannot rate ${event.source} game ${event.sourceId}: expected ${expected} unique linked players.`);
  }
  const red = event.players.filter((player) => player.team === 'red').length;
  const black = event.players.filter((player) => player.team === 'black').length;
  if (red !== 7 - guests.red || black !== 3 - guests.black) {
    throw new Error(`Canonical Elo cannot rate ${event.source} game ${event.sourceId}: expected ${7 - guests.red} red and ${3 - guests.black} black roles.`);
  }
};

export interface EloRebuildRow { player_id: string; nickname: string; elo: number; games: number; }

/**
 * Changes on every canonical rebuild. Every rated change (a saved protocol, a corrected participant, a merge) rebuilds,
 * so the kept Elo timeline (playerEloHistoryService) uses it to know it is stale even when sums stay the same.
 */
let eloInputsGeneration = 0;
export const currentEloInputsGeneration = () => eloInputsGeneration;

export async function rebuildCanonicalEloRatings(db: DatabaseWrapper): Promise<EloRebuildRow[]> {
  eloInputsGeneration += 1;
  const { getFlexibleTournamentStandings: internalGetStandings } = await import('./flexibleTournamentStandingsService.ts');
  const players = await db.all<any>(
    `SELECT id, nickname, COALESCE(elo_seed, ?) AS elo_seed
       FROM players
      WHERE COALESCE(source, '') != 'legacy_guest_migrated'
        AND COALESCE(lifecycle_status, 'normal') NOT IN ('archived', 'merged')
      ORDER BY nickname COLLATE NOCASE, id`,
    [DEFAULT_ELO],
  );
  const guestPlayerRows = await db.all<any>("SELECT id FROM players WHERE COALESCE(source,'') = 'legacy_guest_migrated'");
  const guestPlayerIds = new Set(guestPlayerRows.map((player: any) => String(player.id)));
  const knownPlayerIds = new Set(players.map((player) => String(player.id)));
  const seedByPlayer = new Map<string, number>(players.map((player) => {
    const seed = Number(player.elo_seed);
    return [String(player.id), Number.isFinite(seed) ? seed : DEFAULT_ELO];
  }));
  const events: PreparedEloEvent[] = [];

  const tournaments = await db.all<any>(`
    SELECT DISTINCT t.id, t.date, t.created_at
      FROM tournaments t
      JOIN tournament_games g ON g.tournament_id = t.id
      JOIN tournament_game_protocols p ON p.game_id = g.id
     WHERE g.status = 'completed' AND p.status = 'completed'
     ORDER BY COALESCE(t.date, t.created_at) ASC, t.created_at ASC, t.id ASC
  `);
  for (const tournament of tournaments) {
    const standingsData = await internalGetStandings(db, String(tournament.id));
    const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];
    const games = await db.all<any>(`
      SELECT g.id, g.game_number, COALESCE(p.winner_team, g.winner_team) AS winner_team,
             COALESCE(g.completed_at, t.date, t.created_at) AS sort_at, p.shots_json
        FROM tournament_games g
        JOIN tournaments t ON t.id = g.tournament_id
        JOIN tournament_game_protocols p ON p.game_id = g.id
       WHERE g.tournament_id = ? AND g.status = 'completed' AND p.status = 'completed'
       ORDER BY COALESCE(g.completed_at, t.date, t.created_at) ASC, g.game_number ASC, g.id ASC
    `, [tournament.id]);
    for (const game of games) {
      const winner = normalizeWinnerTeam(game.winner_team);
      if (!winner) throw new Error(`Canonical Elo cannot rate tournament game ${game.id}: winner is missing.`);
      const eventPlayers: PreparedEloPlayer[] = [];
      const contributions = await tournamentWillContributions(db, game, winner, standings);
      for (const participant of standings) {
        if (!participant.player_id) continue;
        const canonicalGame = Array.isArray(participant.games) ? participant.games.find((item: any) => Number(item.game_number) === Number(game.game_number)) : null;
        if (!canonicalGame) continue;
        const team = gameTeamOfRole(canonicalGame.role);
        if (!team) throw new Error(`Canonical Elo cannot rate tournament game ${game.id}: role is missing.`);
        const playerId = String(participant.player_id);
        if (!knownPlayerIds.has(playerId)) throw new Error(`Canonical Elo cannot find player ${playerId}.`);
        eventPlayers.push({ playerId, team, ...tournamentPersonalEloPoints(canonicalGame), contribution: contributions.get(playerId) });
      }
      const event: PreparedEloEvent = { source:'tournament', sourceId:String(game.id), sortAt:String(game.sort_at || tournament.date || tournament.created_at || ''), sortOrder:Number(game.game_number || 0), winnerTeam:winner, players:eventPlayers };
      validatePreparedEvent(event);
      events.push(event);
    }
  }

  const clubGames = await db.all<any>(`
    SELECT g.id, g.global_game_number, g.game_date, g.created_at, g.winner_team, g.protocol_text,
           e.format AS evening_format
      FROM games g
      JOIN game_evenings e ON e.id = g.evening_id
     WHERE g.evening_id IS NOT NULL
       AND g.archived_at IS NULL
       AND g.protocol_text IS NOT NULL
     ORDER BY COALESCE(g.game_date, g.created_at) ASC, g.global_game_number ASC, g.id ASC
  `);
  for (const game of clubGames) {
    if (!eveningFormatAffectsElo(game.evening_format)) continue;
    const payload = safeJsonParse<any>(game.protocol_text, null);
    if (!payload || payload.version !== 1 || payload.kind !== 'club_evening_protocol' || payload.protocol?.status !== 'completed') continue;
    const winner = normalizeWinnerTeam(payload.protocol?.winner_team || game.winner_team);
    if (!winner) throw new Error(`Canonical Elo cannot rate club game ${game.id}: winner is missing.`);
    const results = Array.isArray(payload.player_results) ? payload.player_results : [];

    // A guest without a profile is never an Elo subject, but the game still counts (owner, 2026-10-05): it is rated
    // from the remaining registered players (9 of 10 with one guest), the guest's seat is simply left out.
    // Ambiguous quick_guest rows with external identity are intentionally not treated as guests until migration
    // diagnostics are resolved.
    const isGuestSeat = (result: any) => {
      const playerId = String(result?.player_id || '').trim();
      return Boolean(result?.guest_placeholder_id) || !playerId || guestPlayerIds.has(playerId);
    };
    const guests = { red: 0, black: 0 };
    for (const result of results.filter(isGuestSeat)) {
      const team = gameTeamOfRole(result?.role);
      if (!team) throw new Error(`Canonical Elo cannot rate club game ${game.id}: role is missing.`);
      guests[team] += 1;
    }
    const contributions = clubContributionByPlayer(payload, results);
    const eventPlayers: PreparedEloPlayer[] = results.filter((result: any) => !isGuestSeat(result)).map((result: any) => {
      const playerId = String(result?.player_id || '').trim();
      if (!playerId || !knownPlayerIds.has(playerId)) throw new Error(`Canonical Elo cannot rate club game ${game.id}: linked player is missing.`);
      const team = gameTeamOfRole(result?.role);
      if (!team) throw new Error(`Canonical Elo cannot rate club game ${game.id}: role is missing.`);
      return { playerId, team, canonicalPersonalGamePoints: clubPersonalGamePoints(payload, result, results),
        ...clubPersonalPointParts(payload, result, results), disciplinaryPenaltyPoints: clubDisciplinaryPenaltyPoints(payload, result), eloDisciplinePoints: clubEloDisciplinePoints(payload, result), contribution: contributions.get(playerId) };
    });
    const event: PreparedEloEvent = { source:'club', sourceId:String(game.id), sortAt:String(game.game_date || game.created_at || ''), sortOrder:Number(game.global_game_number || game.id || 0), winnerTeam:winner, players:eventPlayers };
    validatePreparedEvent(event, guests);
    events.push(event);
  }

  normalizeContributions(events);
  events.sort((a, b) => sortTime(a.sortAt) - sortTime(b.sortAt) || a.sortOrder - b.sortOrder || a.source.localeCompare(b.source) || a.sourceId.localeCompare(b.sourceId));
  const ratings = new Map<string, number>(players.map((player) => [String(player.id), seedByPlayer.get(String(player.id)) ?? DEFAULT_ELO]));
  const gameCounts = new Map<string, number>();
  for (const event of events) {
    const gamePlayers: CanonicalEloGamePlayer[] = event.players.map((player) => ({ ...player, elo: ratings.get(player.playerId) ?? seedByPlayer.get(player.playerId) ?? DEFAULT_ELO }));
    const deltas = calculateCanonicalEloGame(gamePlayers, event.winnerTeam);
    for (const delta of deltas) {
      const fallbackSeed = seedByPlayer.get(delta.playerId) ?? DEFAULT_ELO;
      ratings.set(delta.playerId, (ratings.get(delta.playerId) ?? fallbackSeed) + delta.totalDelta);
      gameCounts.set(delta.playerId, (gameCounts.get(delta.playerId) || 0) + 1);
    }
  }
  const persistRatings = async (tx: DatabaseWrapper) => {
    for (const player of players) {
      const playerId = String(player.id);
      const seed = seedByPlayer.get(playerId) ?? DEFAULT_ELO;
      const rating = ratings.get(playerId) ?? seed;
      await tx.run('UPDATE players SET elo = ? WHERE id = ?', [Math.round(rating), playerId]);
    }
  };
  if ((db.sqlite as any)?.inTransaction) await persistRatings(db);
  else await db.transaction(persistRatings);
  eloInputsGeneration += 1;
  return players
    .filter((player) => (gameCounts.get(String(player.id)) || 0) > 0)
    .map((player) => ({ player_id:String(player.id), nickname:String(player.nickname || 'Игрок'), elo:Math.round(ratings.get(String(player.id)) ?? seedByPlayer.get(String(player.id)) ?? DEFAULT_ELO), games:gameCounts.get(String(player.id)) || 0 }))
    .sort((a, b) => b.elo - a.elo || a.nickname.localeCompare(b.nickname, 'ru'));
}




