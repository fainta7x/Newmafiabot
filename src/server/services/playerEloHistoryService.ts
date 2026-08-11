import type { DatabaseWrapper } from '../../db/index.ts';
import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';
import { eveningFormatAffectsElo } from '../../lib/eveningFormat.ts';
import {
  calculateCanonicalEloGame,
  DEFAULT_ELO,
  type CanonicalEloGamePlayer,
  type CanonicalEloPlayerDelta,
  type EloTeam,
} from './eloRatingService.ts';

export interface PlayerEloHistoryRow extends CanonicalEloPlayerDelta {
  eloBefore: number;
  eloAfter: number;
}

export interface PlayerEloHistoryEvent {
  source: 'tournament' | 'club';
  sourceId: string;
  sortAt: string;
  sortOrder: number;
  winnerTeam: EloTeam;
  players: PlayerEloHistoryRow[];
}

type PreparedPlayer = Omit<CanonicalEloGamePlayer, 'elo'>;

type PreparedEvent = {
  source: 'tournament' | 'club';
  sourceId: string;
  sortAt: string;
  sortOrder: number;
  winnerTeam: EloTeam;
  players: PreparedPlayer[];
};

const numeric = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

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

const validatePreparedEvent = (event: PreparedEvent) => {
  if (event.players.length !== 10 || new Set(event.players.map((player) => player.playerId)).size !== 10) {
    throw new Error(`Canonical Elo cannot rate ${event.source} game ${event.sourceId}: expected 10 unique linked players.`);
  }
  const red = event.players.filter((player) => player.team === 'red').length;
  const black = event.players.filter((player) => player.team === 'black').length;
  if (red !== 7 || black !== 3) {
    throw new Error(`Canonical Elo cannot rate ${event.source} game ${event.sourceId}: expected 7 red and 3 black roles.`);
  }
};

const loadPreparedEvents = async (db: DatabaseWrapper) => {
  const { getFlexibleTournamentStandings } = await import('./flexibleTournamentStandingsService.ts');
  const players = await db.all<any>('SELECT id FROM players ORDER BY id');
  const knownPlayerIds = new Set(players.map((player) => String(player.id)));
  const events: PreparedEvent[] = [];

  const tournaments = await db.all<any>(`
    SELECT DISTINCT t.id, t.date, t.created_at
      FROM tournaments t
      JOIN tournament_games g ON g.tournament_id = t.id
      JOIN tournament_game_protocols p ON p.game_id = g.id
     WHERE g.status = 'completed' AND p.status = 'completed'
     ORDER BY COALESCE(t.date, t.created_at) ASC, t.created_at ASC, t.id ASC
  `);

  for (const tournament of tournaments) {
    const standingsData = await getFlexibleTournamentStandings(db, String(tournament.id));
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
      const eventPlayers: PreparedPlayer[] = [];

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

        eventPlayers.push({
          playerId,
          team,
          canonicalPersonalGamePoints: Number(canonicalGame.game_total || 0) - Number(canonicalGame.win_point || 0),
        });
      }

      const event: PreparedEvent = {
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
    const eventPlayers: PreparedPlayer[] = results.map((result: any) => {
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

    const event: PreparedEvent = {
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

  return { playerIds: players.map((player) => String(player.id)), events };
};

export async function loadPlayerEloHistory(db: DatabaseWrapper): Promise<PlayerEloHistoryEvent[]> {
  const prepared = await loadPreparedEvents(db);
  const ratings = new Map<string, number>(prepared.playerIds.map((playerId) => [playerId, DEFAULT_ELO]));
  const timeline: PlayerEloHistoryEvent[] = [];

  for (const event of prepared.events) {
    const gamePlayers: CanonicalEloGamePlayer[] = event.players.map((player) => ({
      ...player,
      elo: ratings.get(player.playerId) ?? DEFAULT_ELO,
    }));
    const deltas = calculateCanonicalEloGame(gamePlayers, event.winnerTeam);
    const rows = deltas.map((delta) => {
      const eloBefore = ratings.get(delta.playerId) ?? DEFAULT_ELO;
      return {
        ...delta,
        eloBefore,
        eloAfter: eloBefore + delta.totalDelta,
      };
    });

    for (const row of rows) ratings.set(row.playerId, row.eloAfter);
    timeline.push({
      source: event.source,
      sourceId: event.sourceId,
      sortAt: event.sortAt,
      sortOrder: event.sortOrder,
      winnerTeam: event.winnerTeam,
      players: rows,
    });
  }

  return timeline;
}
