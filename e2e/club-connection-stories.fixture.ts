import type { ClubConnectionStories } from '../src/shared/clubConnectionStories.ts';
const a = { player_id: 'p1', nickname: 'Александра с длинным никнеймом' };
const b = { player_id: 'p2', nickname: 'Богданчик' };
const c = { player_id: 'p3', nickname: 'Чагин' };
const sample = { games: 8, events: 3, wins: 5, win_rate: 63 };
// Synthetic UI examples, not runtime club statistics.
export const clubStoriesFixture: ClubConnectionStories = {
  black_trios: [{ members: [a, b, c], ...sample }],
  don_mafia: [{ members: [b, a], ...sample }],
  sheriff_citizen: [{ members: [c, a], ...sample }],
  balanced_rivalries: [{ members: [a, b], games: 6, events: 3, a_wins: 3, b_wins: 3 }],
  versatile_pairs: [{ members: [a, c], red: sample, black: { games: 4, events: 2, wins: 2, win_rate: 50 } }],
  table_circles: [{ ...a, games: 24, events: 8, people: 18 }, { ...b, games: 20, events: 6, people: 15 }],
};
