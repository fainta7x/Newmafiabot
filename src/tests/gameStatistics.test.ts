import { describe, expect, it } from 'vitest';
import { buildClubGameStatistics, buildPlayerGameStatistics, type StatGame, type StatRole } from '../lib/gameStatistics.ts';
import type { LiveGameEvent } from '../shared/liveGameEvents.ts';

const roles: StatRole[] = ['citizen', 'mafia', 'sheriff', 'citizen', 'don', 'citizen', 'citizen', 'mafia', 'citizen', 'citizen'];
const seats = roles.map((role, index) => ({ seat: index + 1, role, playerId: `p${index + 1}` }));

let seq = 0;
const ev = (round: number, kind: string, extra: Partial<LiveGameEvent> = {}): LiveGameEvent => ({ seq: ++seq, at: '2026-10-05T10:00:00Z', round, phase: 'day_voting', kind, ...extra });

const game = (id: string, winner: 'red' | 'black', events: LiveGameEvent[]): StatGame => ({ id, source: 'club', date: '2026-10-05T10:00:00Z', winner, seats, events });

// Zero circle: seat 1 nominates the mafia seat 2, seat 4 the sheriff seat 3; seat 2 is voted out. Night: seat 7 is shot
// and becomes the first killed, its best move names seats 2, 5 and 3 (two blacks). The sheriff finds the mafia, the don the sheriff.
// Day 2: a tie and a revote, with one table decision.
const events = () => { seq = 0; return [
  ev(1, 'nomination', { seat: 2, by: 1 }),
  ev(1, 'nomination', { seat: 3, by: 4 }),
  ev(1, 'vote', { seat: 1, target: 2, value: 1 }),
  ev(1, 'vote', { seat: 4, target: 2, value: 1 }),
  ev(1, 'vote', { seat: 6, target: 3, value: 1 }),
  ev(1, 'vote_round_result', { value: '1:single_eliminated' }),
  ev(1, 'zero_round_voted', { seat: 2 }),
  ev(1, 'exit', { seat: 2, value: 'voted_zero_round' }),
  ev(1, 'shot_target', { target: 7, phase: 'night' }),
  ev(1, 'sheriff_check', { target: 2, phase: 'night' }),
  ev(1, 'don_check', { target: 3, phase: 'night' }),
  ev(1, 'exit', { seat: 7, value: 'killed', phase: 'night' }),
  ev(1, 'first_killed', { seat: 7 }),
  ev(1, 'best_move', { seat: 7, value: '2,5,3' }),
  ev(2, 'nomination', { seat: 5, by: 1 }),
  ev(2, 'nomination', { seat: 8, by: 3 }),
  ev(2, 'vote', { seat: 1, target: 5, value: 1 }),
  ev(2, 'vote', { seat: 3, target: 8, value: 1 }),
  ev(2, 'vote_round_result', { value: '1:tie_revote' }),
  ev(2, 'vote', { seat: 1, target: 5, value: 2 }),
  ev(2, 'vote', { seat: 3, target: 8, value: 2 }),
  ev(2, 'table_vote', { seat: 4 }),
  ev(2, 'vote_round_result', { value: '2:single_eliminated' }),
]; };

describe('club statistics across games', () => {
  it('counts what happens at the tables from the chronology', () => {
    const stats = buildClubGameStatistics([game('g1', 'red', events())]);
    expect(stats).toMatchObject({ games: 1, gamesTotal: 1, averageVotingDays: 2, days: 2 });
    expect(stats.revoteDays).toMatchObject({ count: 1, total: 2, percent: 50 });
    expect(stats.tableDecisions).toMatchObject({ count: 1, total: 3 });
    expect(stats.zeroRound).toMatchObject({ games: 1 });
    expect(stats.zeroRound.blackVotedOut).toMatchObject({ count: 1, total: 1, percent: 100 });
    expect(stats.nights.sheriffChecks).toMatchObject({ count: 1, total: 1 });
    expect(stats.nights.donChecks).toMatchObject({ count: 1, total: 1 });
    expect(stats.firstKilled).toMatchObject({ games: 1, averageBlackInBestMove: 2 });
    expect(stats.firstKilled.bestMoveWithBlack).toMatchObject({ count: 1, total: 1 });
    expect(stats.byLength).toEqual([{ days: 2, label: '2', games: 1, redWins: expect.objectContaining({ count: 1, total: 1, percent: 100 }) }]);
  });

  it('leaves out games without a chronology but still counts them in the total', () => {
    const stats = buildClubGameStatistics([game('g1', 'red', events()), game('old', 'black', [])]);
    expect(stats.games).toBe(1);
    expect(stats.gamesTotal).toBe(2);
  });

  it('has nothing to divide by without games: percent is null, not 0', () => {
    const stats = buildClubGameStatistics([]);
    expect(stats).toMatchObject({ games: 0, averageVotingDays: null });
    expect(stats.revoteDays.percent).toBeNull();
    expect(stats.byLength).toEqual([]);
  });
});

describe('statistics of one player', () => {
  const games = () => [game('g1', 'red', events())];

  it('measures a red player\'s votes and nominations against the real roles', () => {
    // seat 1 (red) voted three times: for 2 (mafia), 5 (don), 5 (don); nominated seat 2 and 5, both black
    const stats = buildPlayerGameStatistics(games(), 'p1');
    expect(stats.games).toBe(1);
    expect(stats.votesAsRed).toMatchObject({ count: 3, total: 3, percent: 100 });
    expect(stats.nominationsAsRed).toMatchObject({ count: 2, total: 2, percent: 100 });
    // seat 4 (red) voted once, for the mafia
    expect(buildPlayerGameStatistics(games(), 'p4').votesAsRed).toMatchObject({ count: 1, total: 1 });
    // seat 6 (red) voted for the sheriff: a miss
    expect(buildPlayerGameStatistics(games(), 'p6').votesAsRed).toMatchObject({ count: 0, total: 1, percent: 0 });
  });

  it('counts the best move, the first-killed night and the sheriff and don checks', () => {
    const killed = buildPlayerGameStatistics(games(), 'p7');
    expect(killed.firstKilled).toMatchObject({ count: 1, total: 1 });
    expect(killed.bestMove).toMatchObject({ count: 1, averageBlack: 2 });
    expect(buildPlayerGameStatistics(games(), 'p3').sheriffChecks).toMatchObject({ count: 1, total: 1, percent: 100 });
    expect(buildPlayerGameStatistics(games(), 'p5').donChecks).toMatchObject({ count: 1, total: 1, percent: 100 });
    // somebody else's role statistics stay empty
    expect(buildPlayerGameStatistics(games(), 'p3').donChecks.total).toBe(0);
  });

  it('is empty for a player who has no game with a chronology', () => {
    expect(buildPlayerGameStatistics(games(), 'stranger').games).toBe(0);
    expect(buildPlayerGameStatistics([game('old', 'red', [])], 'p1').games).toBe(0);
  });
});
