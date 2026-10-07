import { expect, it } from 'vitest';
import { buildClubConnectionStories } from '../server/services/clubConnectionStoriesService.ts';
import type { CompletedGameSnapshot } from '../server/services/clubGameAnalyticsService.ts';

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
