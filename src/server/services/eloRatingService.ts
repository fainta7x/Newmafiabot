import type { DatabaseWrapper } from '../../db/index.ts';
import { DEFAULT_ELO_SEED } from '../../db/ensureEloSeedSchema.ts';
import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';
import { eveningFormatAffectsElo } from '../../lib/eveningFormat.ts';

export const DEFAULT_ELO = DEFAULT_ELO_SEED;

export type EloTeam = 'red' | 'black';

export interface CanonicalEloGamePlayer {
  playerId: string;
  team: EloTeam;
  elo: number;
  canonicalPersonalGamePoints: number;
}

export interface CanonicalEloPlayerDelta {
  playerId: string;
  expectedTeamResult: number;
  resultDelta: number;
  carryModifier: number;
  modifiedResultDelta: number;
  personalDelta: number;
  totalDelta: number;
}

type PreparedEloPlayer = Omit<CanonicalEloGamePlayer, 'elo'>;

type PreparedEloEvent = {
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

export function calculateCanonicalEloGame(
  players: CanonicalEloGamePlayer[],
  winnerTeam: EloTeam,
): CanonicalEloPlayerDelta[] {
  const redPlayers = players.filter((player) => player.team === 'red');
  const blackPlayers = players.filter((player) => player.team === 'black');
  if (!redPlayers.length || !blackPlayers.length) {
    throw new Error('Canonical Elo requires both red and black teams.');
  }

  const redTeamAvg = average(redPlayers.map((player) => player.elo));
  const blackTeamAvg = average(blackPlayers.map((player) => player.elo));
  const redOdds = (0.30 / 0.70) * (10 ** ((redTeamAvg - blackTeamAvg) / 400));
  const pRed = redOdds / (1 + redOdds);
  const pBlack = 1 - pRed;

  return players.map((player) => {
    const teamPlayers = player.team === 'red' ? redPlayers : blackPlayers;
    const allies = teamPlayers.filter((ally) => ally.playerId !== player.playerId);
    const allyAvgExcludingSelf = allies.length ? average(allies.map((ally) => ally.elo)) : player.elo;
    const n = clamp((player.elo - allyAvgExcludingSelf) / 200, -1, 1);
    const won = player.team === winnerTeam;

    let carryModifier: number;
    if (won) carryModifier = n > 0 ? 1 + 0.30 * n : 1 - 0.20 * Math.abs(n);
    else carryModifier = n > 0 ? 1 - 0.40 * n : 1 + 0.20 * Math.abs(n);

    const expectedTeamResult = player.team === 'red' ? pRed : pBlack;
    const actualResult = won ? 1 : 0;
    const resultDelta = 10 * (actualResult - expectedTeamResult);
    const modifiedResultDelta = resultDelta * carryModifier;
    const personalDelta = player.canonicalPersonalGamePoints * 8;

    return {
      playerId: player.playerId,
      expectedTeamResult,
      resultDelta,
      carryModifier,
      modifiedResultDelta,
      personalDelta,
      totalDelta: modifiedResultDelta + personalDelta,
    };
  });
}

const teamFromRole = (role: unknown): EloTeam | null => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный', 'sheriff', 'шериф'].includes(value)) return 'red';
  if (['mafia', 'мафия', 'маф', 'black', 'черный', 'don', 'дон'].includes(value)) return 'black';
  return null;
};

const normalizeWinner = (value: unknown): EloTeam | null => {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const bestMovePoints = (seatNumbers: unknown, results: any[]): number => {
  if (!Array.isArray(seatNumbers)) return 0;
  const teams = new Map<number, EloTeam | null>(
    results.map((result: any) => [Number(result?.seat_number), teamFromRole(result?.role)]),
  );
  const blackCount = seatNumbers.reduce(
    (sum: number, seat: unknown) => sum + (teams.get(Number(seat)) === 'black' ? 1 : 0),
    0,
  );
  if (blackCount >= 3) return 0.6;
  if (blackCount === 2) return 0.3;
  if (blackCount === 1) return 0.1;
  return 0;
};

const clubBestMovePointsForParticipant = (protocol: any, participantId: string, results: any[]): number => {
  const modern = Array.isArray(protocol?.best_moves) ? protocol.best_moves : [];
  const relevant = modern.filter((move: any) => String(move?.participant_id || '') === participantId);
  if (relevant.length) {
    return relevant.reduce(
      (sum: number, move: any) => sum + bestMovePoints(move?.seat_numbers, results),
      0,
    );
  }

  if (String(protocol?.best_move_participant_id || '') === participantId) {
    return bestMovePoints(protocol?.best_move_seats, results);
  }
  return 0;
};

const clubPersonalGamePoints = (payload: any, result: any, results: any[]): number => {
  const participantId = String(result?.participant_id || '');
  const isPpkCulprit = payload?.protocol?.end_reason === 'ppk'
    && participantId
    && participantId === String(payload?.protocol?.ppk_culprit_participant_id || '');
  const disciplinaryPenalty = calculateDisciplinaryPenalty(
    Math.max(0, Math.trunc(numeric(result?.minor_technical_fouls))),
    Math.max(0, Math.trunc(numeric(result?.major_technical_fouls))),
    result?.exit_type === 'removed',
    Boolean(isPpkCulprit),
  );

  return numeric(result?.judge_bonus)
    + numeric(result?.protocol_bonus)
    + clubBestMovePointsForParticipant(payload?.protocol, participantId, results)
    + numeric(result?.ci_points)
    - disciplinaryPenalty;
};

const sortTime = (value: string) => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

const validatePreparedEvent = (event: PreparedEloEvent) => {
  if (event.players.length !== 10 || new Set(event.players.map((player) => player.playerId)).size !== 10) {
    throw new Error(`Canonical Elo cannot rate ${event.source} game ${event.sourceId}: expected 10 unique linked players.`);
  }
  const red = event.players.filter((player) => player.team === 'red').length;
  const black = event.players.filter((player) => player.team === 'black').length;
  if (red !== 7 || black !== 3) {
    throw new Error(`Canonical Elo cannot rate ${event.source} game ${event.sourceId}: expected 7 red and 3 black roles.`);
  }
};

export interface EloRebuildRow {
  player_id: string;
  nickname: string;
  elo: number;
  games: number;
}

export async function rebuildCanonicalEloRatings(db: DatabaseWrapper): Promise<EloRebuildRow[]> {
  const { getFlexibleTournamentStandings: internalGetStandings } = await import('./flexibleTournamentStandingsService.ts');

  const players = await db.all<any>(
    'SELECT id, nickname, COALESCE(elo_seed, ?) AS elo_seed FROM players ORDER BY nickname COLLATE NOCASE, id',
    [DEFAULT_ELO],
  );
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
      const winner = normalizeWinner(game.winner_team);
      if (!winner) throw new Error(`Canonical Elo cannot rate tournament game ${game.id}: winner is missing.`);

      const eventPlayers: PreparedEloPlayer[] = [];
      for (const participant of standings) {
        if (!participant.player_id) continue;
        const canonicalGame = Array.isArray(participant.games)
          ? participant.games.find((item: any) => Number(item.game_number) === Number(game.game_number))
          : null;
        if (!canonicalGame) continue;

        const team = teamFromRole(canonicalGame.role);
        if (!team) throw new Error(`Canonical Elo cannot rate tournament game ${game.id}: role is missing.`);
        const playerId = String(participant.player_id);
        if (!knownPlayerIds.has(playerId)) throw new Error(`Canonical Elo cannot find player ${playerId}.`);

        const canonicalPersonalGamePoints = Number(canonicalGame.game_total || 0) - Number(canonicalGame.win_point || 0);
        eventPlayers.push({ playerId, team, canonicalPersonalGamePoints });
      }

      const event: PreparedEloEvent = {
        source: 'tournament',
        sourceId: String(game.id),
        sortAt: String(game.sort_at || tournament.date || tournament.created_at || ''),
        sortOrder: Number(game.game_number || 0),
        winnerTeam: winner,
        players: eventPlayers,
      };
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
    if (!payload || payload.version !== 1 || payload.kind !== 'club_evening_protocol') continue;
    if (payload.protocol?.status !== 'completed') continue;

    const winner = normalizeWinner(payload.protocol?.winner_team || game.winner_team);
    if (!winner) throw new Error(`Canonical Elo cannot rate club game ${game.id}: winner is missing.`);
    const results = Array.isArray(payload.player_results) ? payload.player_results : [];
    const eventPlayers: PreparedEloPlayer[] = results.map((result: any) => {
      const playerId = String(result?.player_id || '').trim();
      if (!playerId || !knownPlayerIds.has(playerId)) {
        throw new Error(`Canonical Elo cannot rate club game ${game.id}: linked player is missing.`);
      }
      const team = teamFromRole(result?.role);
      if (!team) throw new Error(`Canonical Elo cannot rate club game ${game.id}: role is missing.`);
      return {
        playerId,
        team,
        canonicalPersonalGamePoints: clubPersonalGamePoints(payload, result, results),
      };
    });

    const event: PreparedEloEvent = {
      source: 'club',
      sourceId: String(game.id),
      sortAt: String(game.game_date || game.created_at || ''),
      sortOrder: Number(game.global_game_number || game.id || 0),
      winnerTeam: winner,
      players: eventPlayers,
    };
    validatePreparedEvent(event);
    events.push(event);
  }

  events.sort((a, b) =>
    sortTime(a.sortAt) - sortTime(b.sortAt)
    || a.sortOrder - b.sortOrder
    || a.source.localeCompare(b.source)
    || a.sourceId.localeCompare(b.sourceId),
  );

  const ratings = new Map<string, number>(players.map((player) => [
    String(player.id),
    seedByPlayer.get(String(player.id)) ?? DEFAULT_ELO,
  ]));
  const gameCounts = new Map<string, number>();

  for (const event of events) {
    const gamePlayers: CanonicalEloGamePlayer[] = event.players.map((player) => ({
      ...player,
      elo: ratings.get(player.playerId) ?? seedByPlayer.get(player.playerId) ?? DEFAULT_ELO,
    }));
    const deltas = calculateCanonicalEloGame(gamePlayers, event.winnerTeam);
    for (const delta of deltas) {
      const fallbackSeed = seedByPlayer.get(delta.playerId) ?? DEFAULT_ELO;
      ratings.set(delta.playerId, (ratings.get(delta.playerId) ?? fallbackSeed) + delta.totalDelta);
      gameCounts.set(delta.playerId, (gameCounts.get(delta.playerId) || 0) + 1);
    }
  }

  await db.transaction(async (tx) => {
    for (const player of players) {
      const playerId = String(player.id);
      const seed = seedByPlayer.get(playerId) ?? DEFAULT_ELO;
      const rating = ratings.get(playerId) ?? seed;
      await tx.run('UPDATE players SET elo = ? WHERE id = ?', [Math.round(rating), playerId]);
    }
  });

  return players
    .filter((player) => (gameCounts.get(String(player.id)) || 0) > 0)
    .map((player) => ({
      player_id: String(player.id),
      nickname: String(player.nickname || 'Игрок'),
      elo: Math.round(ratings.get(String(player.id)) ?? seedByPlayer.get(String(player.id)) ?? DEFAULT_ELO),
      games: gameCounts.get(String(player.id)) || 0,
    }))
    .sort((a, b) => b.elo - a.elo || a.nickname.localeCompare(b.nickname, 'ru'));
}
