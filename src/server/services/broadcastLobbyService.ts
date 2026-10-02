import type { DatabaseWrapper } from '../../db/index.ts';
import { getFlexibleTournamentStandings } from './flexibleTournamentStandingsService.ts';
import { readLiveBroadcastEnvelope } from './liveBroadcastService.ts';

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

const parse = (value: unknown): any => { try { return JSON.parse(String(value || '')); } catch { return null; } };

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
  const games = await db.all<any>('SELECT id, game_number, status FROM tournament_games WHERE tournament_id = ? ORDER BY game_number', [tournament.id]);
  const next = games.find((game: any) => String(game.status) === 'planned') || null;
  const seats = next ? (await db.all<any>(
    `SELECT s.seat_number, tp.display_name, tp.player_id FROM tournament_game_seats s
       JOIN tournament_participants tp ON tp.id = s.participant_id
      WHERE s.game_id = ? ORDER BY s.seat_number`, [next.id],
  )).map((row: any) => ({ seat: Number(row.seat_number), nickname: String(row.display_name || 'Игрок'), player_id: row.player_id ? String(row.player_id) : null })) : [];
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
    next_game: next ? { number: Number(next.game_number), table: null, seats } : null,
    played_games: games.filter((game: any) => String(game.status) === 'completed').length,
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
  const games = await db.all<any>(
    `SELECT g.id, g.global_game_number, g.protocol_text, et.name AS table_name FROM games g
       LEFT JOIN evening_tables et ON et.id = g.evening_table_id
      WHERE g.evening_id = ? AND g.archived_at IS NULL ORDER BY g.global_game_number, g.id`, [evening.id],
  );
  const played = games.filter((game: any) => parse(game.protocol_text)?.protocol?.status === 'completed');
  const next = games.find((game: any) => parse(game.protocol_text)?.protocol?.status !== 'completed' && Number(game.id) !== Number(onAir)) || null;
  const results = Array.isArray(parse(next?.protocol_text)?.player_results) ? parse(next.protocol_text).player_results : [];
  return {
    event: { kind: 'evening', id: String(evening.id), title: String(evening.title || 'Игровой вечер'), starts_at: evening.starts_at || null },
    next_game: next ? {
      number: games.indexOf(next) + 1,
      table: next.table_name ? String(next.table_name) : null,
      seats: results.map((row: any) => ({ seat: Number(row.seat_number), nickname: String(row.display_name || row.nickname || 'Игрок'), player_id: row.player_id ? String(row.player_id) : null }))
        .sort((a: LobbySeat, b: LobbySeat) => a.seat - b.seat),
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
