import { describe, expect, it } from 'vitest';
import { buildPersonalTeamwork } from '../server/services/personalTeamworkService.ts';
import type { AnalyticsPlayerResult, CompletedGameSnapshot } from '../server/services/clubGameAnalyticsService.ts';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const P = (id: string, role: AnalyticsPlayerResult['role'], team: 'red' | 'black', won: boolean): AnalyticsPlayerResult =>
  ({ player_id: id, nickname: id.toUpperCase(), role, team, won, seat_number: 1 });
let seq = 0;
const game = (players: AnalyticsPlayerResult[], daysAgo = 3): CompletedGameSnapshot => {
  seq += 1;
  return { id: `g${seq}`, source: 'club', event_id: 'e1', date: '', dateMs: NOW - daysAgo * day, played_at: '', title: 't', game_number: seq, winner_team: 'red', players };
};
const avatar = (id: string) => `/a/${id}`;
const all = () => true;

describe('personal teamwork («Моя команда»)', () => {
  it('lists usual teammates per colour and the partners for each of my roles', () => {
    const games = [
      game([P('me', 'don', 'black', true), P('a', 'mafia', 'black', true), P('b', 'mafia', 'black', true), P('x', 'citizen', 'red', false)]),
      game([P('me', 'don', 'black', false), P('a', 'mafia', 'black', false), P('c', 'mafia', 'black', false), P('x', 'sheriff', 'red', true)]),
      game([P('me', 'citizen', 'red', true), P('a', 'sheriff', 'red', true), P('x', 'mafia', 'black', false)]),
    ];
    const result = buildPersonalTeamwork(games, 'me', all, avatar, NOW);
    expect(result.my_team.black[0]).toMatchObject({ player_id: 'a', games: 2, wins: 1, win_rate: 50 });
    expect(result.my_team.red.map((p) => p.player_id)).toEqual(['a']);
    const asDon = result.role_pairs.find((entry) => entry.my_role === 'don')!;
    expect(asDon.games).toBe(2);
    expect(asDon.partners[0]).toMatchObject({ player_id: 'a', partner_role: 'mafia', games: 2 });
    expect(result.role_pairs.find((entry) => entry.my_role === 'sheriff')).toBeUndefined();
  });

  it('names hard and easy opponents only after three games against them', () => {
    const lose = () => game([P('me', 'citizen', 'red', false), P('h', 'mafia', 'black', true)]);
    const win = () => game([P('me', 'citizen', 'red', true), P('e', 'mafia', 'black', false)]);
    const games = [lose(), lose(), lose(), win(), win(), win(), game([P('me', 'citizen', 'red', true), P('few', 'mafia', 'black', false)])];
    const { opponents } = buildPersonalTeamwork(games, 'me', all, avatar, NOW);
    expect(opponents.hard.map((p) => p.player_id)).toEqual(['h']);
    expect(opponents.easy.map((p) => p.player_id)).toEqual(['e']);
  });

  it('counts steps of acquaintance and shows who is closest to the next one', () => {
    const together = (n: number, id: string) => Array.from({ length: n }, () => game([P('me', 'citizen', 'red', true), P(id, 'citizen', 'red', true)]));
    const against = game([P('me', 'citizen', 'red', true), P('met', 'mafia', 'black', false)]);
    const games = [...together(2, 'near'), ...together(4, 'mates'), ...together(6, 'tandem'), against];
    const { stages } = buildPersonalTeamwork(games, 'me', all, avatar, NOW);
    expect(stages.counts).toEqual({ acquaintance: 2, teammates: 1, tandem: 1 });
    expect(stages.closest[0]).toMatchObject({ player_id: 'near', stage: 'acquaintance', games_to_next: 1 });
    expect(stages.closest[1]).toMatchObject({ player_id: 'mates', stage: 'teammates', games_to_next: 2 });
    expect(stages.closest.find((p) => p.player_id === 'tandem')).toBeUndefined();
  });

  it('suggests recently active players I have never shared a game with, and honours hidden connections', () => {
    const games = [
      game([P('me', 'citizen', 'red', true), P('met', 'citizen', 'red', true)]),
      game([P('new1', 'citizen', 'red', true), P('new2', 'mafia', 'black', false)], 5),
      game([P('new1', 'citizen', 'red', true), P('hidden', 'mafia', 'black', false)], 6),
      game([P('old', 'citizen', 'red', true), P('x', 'mafia', 'black', false)], 200),
    ];
    const visible = (id: string) => id !== 'hidden';
    const result = buildPersonalTeamwork(games, 'me', visible, avatar, NOW);
    expect(result.never_played.map((p) => p.player_id)).toEqual(['new1', 'new2']);
    expect(result.never_played[0]).toMatchObject({ recent_games: 2, avatar_url: '/a/new1' });
    expect(JSON.stringify(result)).not.toContain('hidden');
    expect(JSON.stringify(result)).not.toContain('"old"');
  });
});
