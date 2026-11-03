import { expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection } from '../db/index.ts';
import { buildClubConnectionStories } from '../server/services/clubConnectionStoriesService.ts';
import { loadCompletedGameSnapshots, type CompletedGameSnapshot } from '../server/services/clubGameAnalyticsService.ts';

function game(id: string, winner: 'red' | 'black' = 'red'): CompletedGameSnapshot {
  const roles = ['sheriff', 'citizen', 'don', 'mafia', 'mafia'] as const;
  return { id, source: 'club', event_id: 'evening', dateMs: Number(id) || 1, date: '', played_at: '', title: '', game_number: 1, winner_team: winner,
    players: roles.map((role, i) => ({ player_id: String(i), nickname: `Игрок ${i}`, role, team: i < 2 ? 'red' : 'black', won: (i < 2 ? 'red' : 'black') === winner, seat_number: i + 1 })) };
}
const build = (games: CompletedGameSnapshot[], visible = (_id: string) => true) => buildClubConnectionStories(games, visible);
it('counts complete black teams and oriented role pairs with distinct event namespaces', () => {
  const a = game('1'), b = game('2', 'black'); b.source = 'tournament';
  const result = build([a, b]);
  expect(result.black_trios[0]).toMatchObject({ games: 2, events: 2, wins: 1, win_rate: 50 });
  expect(result.black_trios[0].members.map(p => p.player_id)).toEqual(['2', '3', '4']);
  expect(result.don_mafia[0].members.map(p => p.player_id)).toEqual(['2', '3']);
  expect(result.sheriff_citizen[0].members.map(p => p.player_id)).toEqual(['0', '1']);
  const swapped = game('3'); swapped.players[0].role = 'citizen'; swapped.players[1].role = 'sheriff';
  expect(build([a, swapped]).sheriff_citizen).toEqual([]);
});
it('requires the full original trio and never reconstructs it by hiding an extra black player', () => {
  const games = [game('1'), game('2')];
  expect(build(games, id => id !== '4').black_trios).toEqual([]);
  for (const g of games) g.players.push({ ...g.players[4], player_id: '5' });
  expect(build(games, id => id !== '5').black_trios).toEqual([]);
  expect(build(games).black_trios).toEqual([]);
});
it('deduplicates games, rejects duplicate seats, and leaves snapshots untouched', () => {
  const a = game('1'), b = game('2'); const before = JSON.stringify([a, b]);
  expect(build([a, a, b]).black_trios[0].games).toBe(2);
  expect(JSON.stringify([a, b])).toBe(before);
  b.players.push({ ...b.players[0] });
  expect(build([a, b]).black_trios).toEqual([]);
});
it('reports balanced team scores only after four opposing games', () => {
  const games = [game('1'), game('2', 'black'), game('3'), game('4', 'black')];
  expect(build(games.slice(0, 3)).balanced_rivalries).toEqual([]);
  expect(build(games).balanced_rivalries[0]).toMatchObject({ games: 4, events: 1, a_wins: 2, b_wins: 2 });
  expect(build(games.map(g => ({ ...g, winner_team: 'red' }))).balanced_rivalries).toEqual([]);
});
it('keeps both-color results separate and counts distinct co-players, excluding hidden people', () => {
  const games = [game('1'), game('2', 'black'), game('3'), game('4', 'black')];
  for (const g of games.slice(2)) for (const p of g.players.slice(0, 2)) { p.team = 'black'; p.role = 'mafia'; }
  const result = build(games, id => id === '0' || id === '1');
  expect(result.versatile_pairs[0]).toMatchObject({ red: { games: 2, wins: 1 }, black: { games: 2, wins: 1 } });
  expect(result.table_circles).toEqual([
    { player_id: '0', nickname: 'Игрок 0', games: 4, events: 1, people: 1 },
    { player_id: '1', nickname: 'Игрок 1', games: 4, events: 1, people: 1 },
  ]);
  expect(build(games, id => id === '0').table_circles).toEqual([]);
  expect(build(games.slice(0, 3)).versatile_pairs).toEqual([]);
});
it('returns deterministic empty categories for an empty history', () => {
  expect(build([])).toEqual({ black_trios: [], don_mafia: [], sheriff_citizen: [], balanced_rivalries: [], versatile_pairs: [], table_circles: [] });
});

it('rejects a sanitized snapshot explicitly marked as having unresolved original seats', () => {
  const games = [game('1'), game('2')].map(g => ({ ...g, has_unresolved_players: true }));
  expect(build(games)).toEqual(build([]));
});

it('preserves omitted-seat markers from raw club and tournament rows before sanitization', async () => {
  // A real database: the snapshots come through the «Игра» layer now, not from hand-shaped SQL rows.
  const db = createDatabaseConnection(':memory:');
  await createApp(db);
  const date = '2026-10-07T18:00:00.000Z';
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('e','Вечер',?,'Europe/Moscow','CASUAL','completed',20,0,?,?)`, [date, date, date]);
  await db.run(`INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES (1,'e',1,?,'red','',?,'[]',?)`, [date,
    JSON.stringify({ kind: 'club_evening_protocol', protocol: { status: 'completed', winner_team: 'red', completed_at: date }, player_results: [{ seat_number: 1, player_id: 'a', role: 'sheriff' }, { seat_number: 2, player_id: 'b', role: 'citizen' }, { seat_number: 3, player_id: null, role: 'mafia' }] }), date]);
  await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('0','P0',?,?),('1','P1',?,?),('2','P2',?,?)`, [date, date, date, date, date, date]);
  await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES ('t1','Турнир',?,'completed',?,?)`, [date, date, date]);
  await db.run(`INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES ('tp0','t1','0','P0',1),('tp1','t1','1','P1',2),('tp2','t1','2','P2',3)`);
  await db.run(`INSERT INTO tournament_games (id,tournament_id,game_number,status,winner_team,completed_at) VALUES ('t','t1',1,'completed','red',?)`, [date]);
  await db.run(`INSERT INTO tournament_game_protocols (id,game_id,status,winner_team,best_move_seats_json,created_at,updated_at) VALUES ('pr','t','completed','red','[]',?,?)`, [date, date]);
  await db.run(`INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number,role) VALUES ('s0','t','tp0',1,'sheriff'),('s1','t','tp1',2,'citizen'),('s2','t','tp2',3,'unknown')`);
  const snapshots = await loadCompletedGameSnapshots(db);
  db.sqlite.close();
  expect(snapshots).toHaveLength(2);
  expect(snapshots.map(g => ({ source: g.source, incomplete: g.has_unresolved_players, players: g.players.length })).sort((x, y) => x.source.localeCompare(y.source))).toEqual([{ source: 'club', incomplete: true, players: 2 }, { source: 'tournament', incomplete: true, players: 2 }]);
  expect(build(snapshots)).toEqual(build([]));
});
