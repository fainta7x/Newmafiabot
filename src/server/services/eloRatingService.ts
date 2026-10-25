import type { DatabaseWrapper } from '../../db/index.ts';
import { DEFAULT_ELO_SEED } from '../../db/ensureEloSeedSchema.ts';
import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';
import { eveningFormatAffectsElo } from '../../lib/eveningFormat.ts';
import { gameTeamOfRole, normalizeWinnerTeam } from '../../shared/gameRoles.ts';
import { clubBestMovePointsForParticipant } from './bestMovePoints.ts';
import { gameContribution } from '../../lib/playerContribution.ts';


export const DEFAULT_ELO = DEFAULT_ELO_SEED;
export type EloTeam = 'red' | 'black';

export interface CanonicalEloGamePlayer {
  playerId: string;
  team: EloTeam;
  elo: number;
  canonicalPersonalGamePoints: number;
  /** Individual contribution already measured against the role's club average, in points (club games only). */
  contributionPoints?: number;
}

export interface CanonicalEloPlayerDelta {
  playerId: string;
  expectedTeamResult: number;
  resultDelta: number;
  carryModifier: number;
  modifiedResultDelta: number;
  personalDelta: number;
  contributionDelta: number;
  totalDelta: number;
}

export type PreparedEloPlayer = Omit<CanonicalEloGamePlayer, 'elo'> & { contribution?: { role: string; raw: number } };
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
 * The Elo scale (owner, 2026-10-01): every distance from 1000 is five times larger than in the first
 * version, so one game, the win expectation and the strong-player protection all use ×5 units.
 * The behaviour is the same as before, only the numbers are bigger.
 */
export const ELO_SCALE = 5;
const RESULT_WEIGHT = 10 * ELO_SCALE;
const PERSONAL_POINT_WEIGHT = 8 * ELO_SCALE;
/**
 * Table level (owner, 2026-10-24: «в пределах 150 Elo уровень одинаковый, от 150 до 250 уровень сильно различается, от 250 огромная
 * разница»). A gap between two averages is first turned into an effective level gap, then the usual 10^(gap / divisor) odds are used:
 *  - up to 150 Elo the levels are the same (no effect);
 *  - 150–250: the effect grows one-for-one (0…100);
 *  - above 250: «huge», the effect grows twice as fast, up to 300 (gap 350 and more is the same);
 * The distances are not stretched ×5 any more; the weight of a game and of a personal point stay on the ×5 scale.
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

export function calculateCanonicalEloGame(players: CanonicalEloGamePlayer[], winnerTeam: EloTeam): CanonicalEloPlayerDelta[] {
  const redPlayers = players.filter((player) => player.team === 'red');
  const blackPlayers = players.filter((player) => player.team === 'black');
  if (!redPlayers.length || !blackPlayers.length) throw new Error('Canonical Elo requires both red and black teams.');
  const redTeamAvg = average(redPlayers.map((player) => player.elo));
  const blackTeamAvg = average(blackPlayers.map((player) => player.elo));
  const redOdds = (0.30 / 0.70) * (10 ** (levelGap(redTeamAvg - blackTeamAvg) / EXPECTATION_DIVISOR));
  const pRed = redOdds / (1 + redOdds);
  const pBlack = 1 - pRed;
  return players.map((player) => {
    const teamPlayers = player.team === 'red' ? redPlayers : blackPlayers;
    const allies = teamPlayers.filter((ally) => ally.playerId !== player.playerId);
    const allyAvgExcludingSelf = allies.length ? average(allies.map((ally) => ally.elo)) : player.elo;
    const n = clamp(levelGap(player.elo - allyAvgExcludingSelf) / PROTECTION_DIVISOR, -1, 1);
    const won = player.team === winnerTeam;
    let carryModifier: number;
    if (won) carryModifier = n > 0 ? 1 + 0.30 * n : 1 - 0.20 * Math.abs(n);
    else carryModifier = n > 0 ? 1 - 0.40 * n : 1 + 0.20 * Math.abs(n);
    const expectedTeamResult = player.team === 'red' ? pRed : pBlack;
    const actualResult = won ? 1 : 0;
    const resultDelta = RESULT_WEIGHT * (actualResult - expectedTeamResult);
    const modifiedResultDelta = resultDelta * carryModifier;
    const personalDelta = player.canonicalPersonalGamePoints * PERSONAL_POINT_WEIGHT;
    const contributionDelta = (player.contributionPoints || 0) * PERSONAL_POINT_WEIGHT;
    return { playerId: player.playerId, expectedTeamResult, resultDelta, carryModifier, modifiedResultDelta, personalDelta, contributionDelta, totalDelta: modifiedResultDelta + personalDelta + contributionDelta };
  });
}

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

/** A player's personal points in a club game (judge and protocol bonus, best move, Ci, minus discipline): Elo and its history. */
export const clubPersonalGamePoints = (payload: any, result: any, results: any[]): number => {
  const participantId = String(result?.participant_id || '');
  const isPpkCulprit = payload?.protocol?.end_reason === 'ppk' && participantId && participantId === String(payload?.protocol?.ppk_culprit_participant_id || '');
  const disciplinaryPenalty = calculateDisciplinaryPenalty(
    Math.max(0, Math.trunc(numeric(result?.minor_technical_fouls))),
    Math.max(0, Math.trunc(numeric(result?.major_technical_fouls))),
    result?.exit_type === 'removed',
    Boolean(isPpkCulprit),
  );
  return numeric(result?.judge_bonus) + numeric(result?.protocol_bonus) + clubBestMovePointsForParticipant(payload?.protocol, participantId, results) + numeric(result?.ci_points) - disciplinaryPenalty;
};

/**
 * Individual contribution (owner, 2026-10-25): an addition to the result, never a replacement. Points come from the game's
 * own facts (`playerContribution.ts`); every found black is praised, no role adjustment (the weights balance the roles);
 * one game moves Elo by at most ±35; it accumulates without a ceiling — a player who keeps playing well keeps rising.
 */
export const CONTRIBUTION_CAP_ELO = 35;
export const clubContributionByPlayer = (payload: any, results: any[]): Map<string, { role: string; raw: number }> => {
  const bySeat = new Map(gameContribution(payload).map((item) => [item.seat, item]));
  const out = new Map<string, { role: string; raw: number }>();
  for (const result of results) {
    const playerId = String(result?.player_id || '').trim();
    const item = bySeat.get(Number(result?.seat_number));
    if (playerId && item?.role) out.set(playerId, { role: item.role, raw: item.points });
  }
  return out;
};
export const normalizeContributions = (events: PreparedEloEvent[]) => {
  const cap = CONTRIBUTION_CAP_ELO / PERSONAL_POINT_WEIGHT;
  for (const event of events) for (const player of event.players) {
    if (player.contribution) player.contributionPoints = clamp(player.contribution.raw, -cap, cap);
  }
};

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
             COALESCE(g.completed_at, t.date, t.created_at) AS sort_at
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
      for (const participant of standings) {
        if (!participant.player_id) continue;
        const canonicalGame = Array.isArray(participant.games) ? participant.games.find((item: any) => Number(item.game_number) === Number(game.game_number)) : null;
        if (!canonicalGame) continue;
        const team = gameTeamOfRole(canonicalGame.role);
        if (!team) throw new Error(`Canonical Elo cannot rate tournament game ${game.id}: role is missing.`);
        const playerId = String(participant.player_id);
        if (!knownPlayerIds.has(playerId)) throw new Error(`Canonical Elo cannot find player ${playerId}.`);
        const canonicalPersonalGamePoints = Number(canonicalGame.game_total || 0) - Number(canonicalGame.win_point || 0);
        eventPlayers.push({ playerId, team, canonicalPersonalGamePoints });
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
      return { playerId, team, canonicalPersonalGamePoints: clubPersonalGamePoints(payload, result, results), contribution: contributions.get(playerId) };
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
