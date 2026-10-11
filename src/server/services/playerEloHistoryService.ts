import type { DatabaseWrapper } from '../../db/index.ts';
import { sqliteReadVersion } from './sqliteReadVersion.ts';
import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';
import { eveningFormatAffectsElo } from '../../lib/eveningFormat.ts';
import {
  calculateCanonicalEloGame,
  currentEloInputsGeneration,
  DEFAULT_ELO,
  type CanonicalEloGamePlayer,
  type CanonicalEloPlayerDelta,
  type EloTeam,
} from './eloRatingService.ts';

export interface PlayerEloHistoryRow extends CanonicalEloPlayerDelta {
  eloBefore: number;
  eloAfter: number;
  team: EloTeam;
  won: boolean;
  canonicalPersonalGamePoints: number;
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

/** `guests` are the seats of guests without a profile: they are left out of the rating, so fewer players are expected. */
const validatePreparedEvent = (event: PreparedEvent, guests: { red: number; black: number } = { red: 0, black: 0 }) => {
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

const loadPreparedEvents = async (db: DatabaseWrapper) => {
  const { getFlexibleTournamentStandings } = await import('./flexibleTournamentStandingsService.ts');
  const players = await db.all<any>(
    'SELECT id, COALESCE(elo_seed, ?) AS elo_seed FROM players ORDER BY id',
    [DEFAULT_ELO],
  );
  const knownPlayerIds = new Set(players.map((player) => String(player.id)));
  const guestPlayerRows = await db.all<any>("SELECT id FROM players WHERE COALESCE(source,'') = 'legacy_guest_migrated'");
  const guestPlayerIds = new Set(guestPlayerRows.map((player: any) => String(player.id)));
  const seedByPlayer = new Map<string, number>(players.map((player) => {
    const seed = Number(player.elo_seed);
    return [String(player.id), Number.isFinite(seed) ? seed : DEFAULT_ELO];
  }));
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
    // Same rule as the canonical Elo rebuild (`eloRatingService`): a guest without a profile is never an Elo subject, but
    // the game still counts (owner, 2026-10-05) — it is rated from the remaining registered players, the guest's seat left out.
    const isGuestSeat = (result: any) => {
      const playerId = String(result?.player_id || '').trim();
      return Boolean(result?.guest_placeholder_id) || !playerId || guestPlayerIds.has(playerId);
    };
    const guests = { red: 0, black: 0 };
    for (const result of results.filter(isGuestSeat)) {
      const team = teamFromRole(result?.role);
      if (!team) throw new Error(`Canonical Elo cannot rate club game ${game.id}: role is missing.`);
      guests[team] += 1;
    }
    const eventPlayers: PreparedPlayer[] = results.filter((result: any) => !isGuestSeat(result)).map((result: any) => {
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
    validatePreparedEvent(event, guests);
    events.push(event);
  }

  events.sort((a, b) =>
    sortTime(a.sortAt) - sortTime(b.sortAt)
    || a.sortOrder - b.sortOrder
    || a.source.localeCompare(b.source)
    || a.sourceId.localeCompare(b.sourceId),
  );

  return { playerIds: players.map((player) => String(player.id)), seedByPlayer, events };
};

/*
 * The timeline replays every club and tournament game (with tournament standings) and runs synchronously on the
 * database. On 2026-10-06 that froze the whole server for 20-30 s every minute: each open player app asks for its
 * notifications once a minute (two replays per request) and the background notification scan replays it too.
 * The result is kept per database and replayed only when its inputs change. The fingerprint counts the rows and
 * the protocol sizes, the stored Elo, the tournament participants and the generation of the canonical rebuild, which
 * every rated save runs; when it cannot be read the timeline is replayed as before.
 */
const timelineCache = new WeakMap<object, { version: string | null; fingerprint: string; timeline: Promise<PlayerEloHistoryEvent[]> }>();

async function eloInputsFingerprint(db: DatabaseWrapper): Promise<string | null> {
  try {
    const parts = await Promise.all([
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(LENGTH(protocol_text)) AS s, TOTAL(LENGTH(COALESCE(winner_team, ''))) AS w, COUNT(archived_at) AS a FROM games`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(LENGTH(COALESCE(format, ''))) AS f FROM game_evenings`),
      db.get(`SELECT COUNT(*) AS c, TOTAL(COALESCE(elo_seed, 0)) AS seed, TOTAL(COALESCE(elo, 0)) AS elo, TOTAL(LENGTH(COALESCE(source, ''))) AS src FROM players`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r FROM tournaments`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(LENGTH(COALESCE(status, ''))) AS s, TOTAL(LENGTH(COALESCE(winner_team, ''))) AS w FROM tournament_games`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(LENGTH(COALESCE(status, ''))) AS s, TOTAL(LENGTH(COALESCE(winner_team, ''))) AS w FROM tournament_game_protocols`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(judge_bonus) + TOTAL(protocol_bonus) + TOTAL(penalty_points) + TOTAL(ci_points) AS s FROM tournament_game_player_results`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(LENGTH(COALESCE(role, ''))) AS s FROM tournament_game_seats`),
    ]);
    // Identity swaps keep counts and sums: the participants themselves and the rebuild generation catch them.
    const participants = await db.get(`SELECT group_concat(id || ':' || COALESCE(player_id, ''), ',') AS ids FROM (SELECT id, player_id FROM tournament_participants ORDER BY id)`);
    return JSON.stringify([currentEloInputsGeneration(), parts, participants]);
  } catch {
    return null;
  }
}

export async function loadPlayerEloHistory(db: DatabaseWrapper): Promise<PlayerEloHistoryEvent[]> {
  const version = sqliteReadVersion(db);
  const cached = timelineCache.get(db as object);
  // The common read-only path is O(1), even with a long history.
  if (version !== null && cached?.version === version) return cached.timeline;
  // A database write is not necessarily a game/Elo change (it may just mark a
  // notification read). Recheck the original input fingerprint before replaying
  // the expensive chronological Elo calculation; preserve existing semantics.
  const fingerprint = await eloInputsFingerprint(db);
  if (fingerprint && cached?.fingerprint === fingerprint) {
    cached.version = version;
    return cached.timeline;
  }
  const timeline = replayPlayerEloHistory(db);
  if (fingerprint) {
    timelineCache.set(db as object, { version, fingerprint, timeline });
    void timeline.catch(() => { if (timelineCache.get(db as object)?.timeline === timeline) timelineCache.delete(db as object); });
  }
  return timeline;
}

async function replayPlayerEloHistory(db: DatabaseWrapper): Promise<PlayerEloHistoryEvent[]> {
  const prepared = await loadPreparedEvents(db);
  const ratings = new Map<string, number>(prepared.playerIds.map((playerId) => [
    playerId,
    prepared.seedByPlayer.get(playerId) ?? DEFAULT_ELO,
  ]));
  const timeline: PlayerEloHistoryEvent[] = [];

  for (const event of prepared.events) {
    const gamePlayers: CanonicalEloGamePlayer[] = event.players.map((player) => ({
      ...player,
      elo: ratings.get(player.playerId) ?? DEFAULT_ELO,
    }));
    const deltas = calculateCanonicalEloGame(gamePlayers, event.winnerTeam);
    const rows = deltas.map((delta) => {
      const eloBefore = ratings.get(delta.playerId) ?? DEFAULT_ELO;
      const preparedPlayer = event.players.find((player) => player.playerId === delta.playerId);
      const team = preparedPlayer?.team ?? 'red';
      return {
        ...delta,
        eloBefore,
        eloAfter: eloBefore + delta.totalDelta,
        team,
        won: team === event.winnerTeam,
        canonicalPersonalGamePoints: preparedPlayer?.canonicalPersonalGamePoints ?? 0,
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
