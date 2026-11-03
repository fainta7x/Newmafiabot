import type { DatabaseWrapper } from '../../db/index.ts';
import { getFlexibleTournamentStandings } from './flexibleTournamentStandingsService.ts';
import { readLiveBroadcastEnvelope } from './liveBroadcastService.ts';
import { listEventGames } from './gameService.ts';

/**
 * «Заставка» and «Итоги» scenes (owner, 2026-10-01): what the broadcast shows between games.
 * The event is today's tournament if there is one (a tournament is what gets streamed), otherwise
 * today's club evening. The next game is the first one not yet played — not the one on air now.
 */
const HOUR = 3_600_000;
export type LobbySeat = { seat: number; nickname: string; player_id: string | null };
export type BroadcastStanding = { place: number; nickname: string; points: number; player_id: string | null };
export type BroadcastLobby = {
  event: { kind: 'tournament' | 'evening'; id: string; title: string; starts_at: string | null } | null;
  next_game: { number: number; table: string | null; seats: LobbySeat[] } | null;
  played_games: number;
  total_games: number | null;
  standings: BroadcastStanding[];
};

export const broadcastLobbyPlayerIds = (lobby: BroadcastLobby) => new Set<string>([
  ...(lobby.next_game?.seats || []).map((seat) => seat.player_id),
  ...(lobby.standings || []).map((row) => row.player_id),
].filter((playerId): playerId is string => Boolean(playerId)));

async function todaysTournament(db: DatabaseWrapper, now: number) {
  const columns = new Set((await db.all<any>('PRAGMA table_info(tournaments)')).map((row: any) => String(row.name)));
  if (!columns.has('date')) return null;
  return db.get<any>(
    `SELECT id, title, date, game_count FROM tournaments
      WHERE COALESCE(status, '') NOT IN ('cancelled', 'completed', 'draft')
        AND datetime(date) > datetime(?) AND datetime(date) <= datetime(?)
      ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, datetime(date) LIMIT 1`,
    [new Date(now - 14 * HOUR).toISOString(), new Date(now + 14 * HOUR).toISOString()],
  );
}

async function tournamentLobby(db: DatabaseWrapper, tournament: any): Promise<BroadcastLobby> {
  // The games and the next game's seats through the one «Игра» layer.
  const games = await listEventGames(db, 'tournament', String(tournament.id));
  const next = games.find((game) => game.status === 'planned') || null;
  const seats: LobbySeat[] = next ? next.seats.map((seat) => ({ seat: seat.seat, nickname: seat.nickname || 'Игрок', player_id: seat.playerId })) : [];
  let standings: BroadcastLobby['standings'] = [];
  try {
    const participants = await db.all<any>(
      'SELECT id, player_id FROM tournament_participants WHERE tournament_id = ?',
      [tournament.id],
    );
    const playerIdByParticipant = new Map<string, string | null>(participants.map((row: any) => [
      String(row.id),
      row.player_id ? String(row.player_id) : null,
    ]));
    standings = ((await getFlexibleTournamentStandings(db, String(tournament.id))).standings || [])
      .map((row: any) => ({
        place: Number(row.place),
        nickname: String(row.display_name || 'Игрок'),
        points: Number(row.total_points || 0),
        player_id: row.player_id
          ? String(row.player_id)
          : playerIdByParticipant.get(String(row.participant_id)) || null,
      }));
  } catch { standings = []; }
  return {
    event: { kind: 'tournament', id: String(tournament.id), title: String(tournament.title || 'Турнир'), starts_at: tournament.date || null },
    next_game: next ? { number: Number(next.number), table: null, seats } : null,
    played_games: games.filter((game) => game.status === 'completed').length,
    total_games: Number(tournament.game_count || games.length) || null,
    standings,
  };
}

async function eveningLobby(db: DatabaseWrapper, now: number): Promise<BroadcastLobby | null> {
  const evening = await db.get<any>(
    `SELECT id, title, starts_at FROM game_evenings
      WHERE status IN ('active', 'published') AND settled_at IS NULL
        AND datetime(starts_at) > datetime(?) AND datetime(starts_at) <= datetime(?)
      ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, datetime(starts_at) LIMIT 1`,
    [new Date(now - 14 * HOUR).toISOString(), new Date(now + 14 * HOUR).toISOString()],
  );
  if (!evening) return null;
  const onAir = readLiveBroadcastEnvelope(now).state?.gameId ?? null;
  const games = (await listEventGames(db, 'evening', String(evening.id))).filter((game) => game.status !== 'archived');
  const played = games.filter((game) => game.status === 'completed');
  const next = games.find((game) => game.status !== 'completed' && Number(game.id) !== Number(onAir)) || null;
  return {
    event: { kind: 'evening', id: String(evening.id), title: String(evening.title || 'Игровой вечер'), starts_at: evening.starts_at || null },
    next_game: next ? {
      number: games.indexOf(next) + 1,
      table: next.tableName,
      seats: next.seats.map((seat) => ({ seat: seat.seat, nickname: seat.nickname || 'Игрок', player_id: seat.playerId })),
    } : null,
    played_games: played.length,
    total_games: null,
    standings: [],
  };
}

export async function loadBroadcastLobby(db: DatabaseWrapper, now = Date.now()): Promise<BroadcastLobby> {
  const tournament = await todaysTournament(db, now);
  if (tournament) return tournamentLobby(db, tournament);
  return (await eveningLobby(db, now)) || { event: null, next_game: null, played_games: 0, total_games: null, standings: [] };
}
