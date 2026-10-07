import { expect, it } from 'vitest';
import { buildClubRelationships } from '../server/services/clubRelationshipsService.ts';
import type { CompletedGameSnapshot } from '../server/services/clubGameAnalyticsService.ts';

function game(id: string, event: string, time: number, winner: 'red' | 'black' = 'red', source: 'club' | 'tournament' = 'club'): CompletedGameSnapshot {
  return { id, event_id: event, dateMs: time, date: '2026-10-07T18:00:00Z', played_at: '2026-10-07T18:00:00Z', title: event, game_number: time, source, winner_team: winner,
    players: [{ player_id: 'a', nickname: 'А', role: 'citizen', team: 'red', won: winner === 'red', seat_number: 1 }, { player_id: 'b', nickname: 'Б', role: 'sheriff', team: 'red', won: winner === 'red', seat_number: 2 }, { player_id: 'c', nickname: 'В', role: 'mafia', team: 'black', won: winner === 'black', seat_number: 3 }, { player_id: 'd', nickname: 'Г', role: 'don', team: 'black', won: winner === 'black', seat_number: 4 }] };
}
it('keeps first encounters separate from the ranked club pool and preserves team wins', () => {
  const one = buildClubRelationships([game('1', 'e', 1)], 'a');
  expect(one.club_duos.red).toEqual([]);
  expect(one.club_first_games.red[0]).toMatchObject({ games: 1, wins: 1 });
  const two = buildClubRelationships([game('1', 'e', 1), game('2', 'e', 2, 'black')], 'a');
  expect(two.club_first_games.red).toEqual([]);
  expect(two.club_duos.red[0]).toMatchObject({ games: 2, wins: 1, win_rate: 50 });
  expect(two.rivals[0]).toMatchObject({ games: 2, wins: 1 });
});
it('separates source namespaces and selects the latest event the viewer actually played', () => {
  const tournament = game('t', 'same', 4, 'black', 'tournament');
  const outsider = game('other', 'other', 5); outsider.players = outsider.players.filter(p => p.player_id !== 'a');
  const data = buildClubRelationships([game('old', 'same', 1), outsider, tournament], 'a');
  expect(data.recent_event).toMatchObject({ source: 'tournament', title: 'same' });
  expect(data.recent_event?.teammates[0]).toMatchObject({ games: 1, wins: 0 });
  expect(buildClubRelationships([outsider], 'absent').recent_event).toBeNull();
  expect(buildClubRelationships([outsider], 'absent').club_first_games.black).toHaveLength(1);
});
it('counts a person on both sides when roles change within the same event', () => {
  const second = game('2', 'e', 2, 'black');
  second.players[1] = { ...second.players[1], team: 'black', role: 'mafia', won: true };
  const recent = buildClubRelationships([game('1', 'e', 1), second], 'a').recent_event;
  expect(recent?.teammates.find(p => p.player_id === 'b')).toMatchObject({ games: 1, wins: 1 });
  expect(recent?.rivals.find(p => p.player_id === 'b')).toMatchObject({ games: 1, wins: 0 });
});
it('ranks most-played pairs by shared games independently of best results', () => {
  const many = [1, 2, 3].map(n => game(String(n), 'e', n, 'black'));
  const newcomers = [4, 5].map(n => { const g = game(String(n), 'e', n); g.players = g.players.map(p => ({ ...p, player_id: `new-${p.player_id}` })); return g; });
  const result = buildClubRelationships([...many, ...newcomers], 'a');
  expect(result.club_most_played.red[0]).toMatchObject({ a_id: 'a', games: 3, wins: 0 });
  expect(result.club_duos.red[0]).toMatchObject({ a_id: 'new-a', games: 2, wins: 2 });
  expect(buildClubRelationships([], 'a').club_duos).toEqual({ red: [], black: [] });
});

it('filters hidden participants before ranking, first samples and personal recent lists', () => {
  const games = [game('1', 'e', 1), game('2', 'e', 2)];
  for (const samples of [[games[0]], games]) {
    const result = buildClubRelationships(samples, 'a', id => id !== 'b' && id !== 'd');
    expect(result.club_duos.red).toEqual([]);
    expect(result.club_most_played.red).toEqual([]);
    expect(result.club_first_games.red).toEqual([]);
    expect(result.club_duos.black).toEqual([]);
    expect(result.teammates).toEqual([]);
    expect(result.recent_event?.teammates).toEqual([]);
    expect(result.rivals.map(p => p.player_id)).toEqual(['c']);
    expect(result.recent_event?.rivals.map(p => p.player_id)).toEqual(['c']);
    expect(JSON.stringify(result)).not.toContain('"b"');
    expect(JSON.stringify(result)).not.toContain('"d"');
  }
  expect(buildClubRelationships(games, 'a', () => true).club_duos.red).toHaveLength(1);
});
