import { describe, expect, it } from 'vitest';
import type { StatGame } from '../lib/gameStatistics.ts';
import { buildNightShotStats, gameNights } from '../lib/nightShots.ts';

let seq = 0;
const ev = (round: number, kind: string, extra: Record<string, unknown> = {}, phase = 'night') => ({ seq: ++seq, at: '2026-09-24T18:00:00.000Z', round, phase, kind, ...extra }) as any;
const night = (round: number, opts: { shot?: number; killed?: number; morning?: boolean }) => [
  ev(round, 'night_step', { value: 'shooting' }),
  ...(opts.shot ? [ev(round, 'shot_target', { target: opts.shot })] : []),
  ...(opts.killed ? [ev(round, 'exit', { seat: opts.killed, value: 'killed' })] : []),
  ...(opts.morning === false ? [] : [ev(round, 'night_step', { value: 'morning' })]),
];
const seats = [
  { seat: 1, role: 'citizen' as const, playerId: 'victim' },
  { seat: 2, role: 'mafia' as const, playerId: 'black1' },
  { seat: 3, role: 'don' as const, playerId: 'black2' },
  { seat: 4, role: 'sheriff' as const, playerId: 'red' },
];
const game = (id: string, events: any[]): StatGame => ({ id, source: 'club', date: '2026-09-24T18:00:00.000Z', winner: 'red', seats, events });

describe('night shots of the black team', () => {
  it('tells a kill, a shot that killed nobody and a night without a shot, and ignores unfinished nights', () => {
    const nights = gameNights(game('g', [
      ev(1, 'game_start', {}, 'setup'),
      ...night(2, { shot: 1, killed: 1 }),
      ...night(3, { shot: 4 }),
      ...night(4, {}),
      ...night(5, { shot: 4, morning: false }),
    ]));
    expect(nights.map((item) => [item.round, item.result, item.victim])).toEqual([[2, 'killed', 1], [3, 'survived', null], [4, 'no_shot', null]]);
  });

  it('does not count a restored player as a victim', () => {
    const nights = gameNights(game('r', [...night(2, { shot: 1, killed: 1, morning: false }), ev(2, 'restored', { seat: 1 }), ev(2, 'night_step', { value: 'morning' })]));
    expect(nights.map((item) => item.result)).toEqual(['survived']);
  });

  it('attributes nights to every black player and pairs the victim with each of them', () => {
    const games = [
      game('a', [...night(2, { shot: 1, killed: 1 }), ...night(3, {})]),
      game('b', [...night(2, { shot: 1, killed: 1 })]),
      game('c', [...night(2, { shot: 4 })]),
    ];
    const stats = buildNightShotStats(games);
    expect(stats.players.get('black1')).toMatchObject({ blackNights: 4, blackMisses: 2 });
    expect(stats.players.get('black2')).toMatchObject({ blackNights: 4, blackMisses: 2 });
    expect(stats.players.get('victim')).toMatchObject({ killed: 2, redGames: 3, blackNights: 0 });
    expect(stats.pairs.get('victim|black1')).toMatchObject({ kills: 2, together: 3 });
    expect(stats.pairs.get('victim|black2')).toMatchObject({ kills: 2, together: 3 });
    // The sheriff was never shot: a pair with no kills still counts the games together.
    expect(stats.pairs.get('red|black1')).toMatchObject({ kills: 0, together: 3 });
  });
});
