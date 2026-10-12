import { describe, expect, it } from 'vitest';
import type { StatGame, StatRole } from '../lib/gameStatistics.ts';
import { buildRevealStats, finalReveals, revealVersions } from '../lib/revealStats.ts';
import type { LiveGameEvent } from '../shared/liveGameEvents.ts';

const roles: StatRole[] = ['citizen', 'mafia', 'sheriff', 'citizen', 'don', 'citizen', 'citizen', 'mafia', 'citizen', 'citizen'];
const seats = roles.map((role, index) => ({ seat: index + 1, role, playerId: `p${index + 1}` }));
let seq = 0;
const ev = (round: number, kind: string, extra: Partial<LiveGameEvent> = {}): LiveGameEvent => ({ seq: ++seq, at: '2026-10-12T10:00:00Z', round, phase: 'day_voting', kind, ...extra });
const game = (events: LiveGameEvent[], id = 'g'): StatGame => ({ id, source: 'club', date: '2026-10-12T10:00:00Z', winner: 'red', seats, events });

// Day 2: the real Sheriff (3) reveals with checks on the Don (5) and a red (1); the mafia (8) reveals and covers the Don with «red».
// Seat 1 votes for the Sheriff, seat 4 for the mafia, seat 6 for the Don; seat 8 is voted out.
const events = () => { seq = 0; return [
  ev(2, 'reveal', { seat: 3, phase: 'day_speeches' }),
  ev(2, 'announced_check', { seat: 3, target: 5, value: 'black' }),
  ev(2, 'announced_check', { seat: 3, target: 1, value: 'red' }),
  ev(2, 'reveal', { seat: 8, phase: 'day_speeches' }),
  ev(2, 'announced_check', { seat: 8, target: 5, value: 'red' }),
  ev(2, 'announced_check', { seat: 8, target: 6, value: 'black' }),
  ev(2, 'nomination', { seat: 3, by: 1 }), ev(2, 'nomination', { seat: 8, by: 4 }), ev(2, 'nomination', { seat: 5, by: 6 }),
  ev(2, 'vote', { seat: 1, target: 3, value: 1 }), ev(2, 'vote', { seat: 4, target: 8, value: 1 }), ev(2, 'vote', { seat: 6, target: 5, value: 1 }),
  ev(2, 'vote_round_result', { value: '1:single_eliminated' }),
  ev(2, 'exit', { seat: 8, value: 'voted_day' }),
]; };

describe('reveal statistics', () => {
  it('keeps only the reveals and checks standing at the end', () => {
    seq = 0;
    const list = [ev(2, 'reveal', { seat: 3 }), ev(2, 'announced_check', { seat: 3, target: 5, value: 'black' }), ev(2, 'announced_check_removed', { seat: 3, target: 5 }), ev(2, 'reveal', { seat: 8 }), ev(2, 'reveal_removed', { seat: 8 })];
    const result = finalReveals(game(list));
    expect([...result.keys()]).toEqual([3]);
    expect(result.get(3)!.checks.size).toBe(0);
  });

  it('counts the Sheriff, the black revealers and the red votes for revealed candidates', () => {
    const stats = buildRevealStats([game(events())]);
    expect(stats.get('p3')).toMatchObject({ sheriffGames: 1, sheriffReveals: 1, sheriffCheckedDon: 1, sheriffCheckedMafia: 0, sheriffCheckedRed: 1 });
    expect(stats.get('p8')).toMatchObject({ blackGames: 1, blackReveals: 1, blackRevealsMafia: 1, blackRevealsDon: 0, blackCovers: 1, blackAnnouncedBlackOnRed: 1 });
    expect(stats.get('p5')).toMatchObject({ blackGames: 1, blackReveals: 0 });
    expect(stats.get('p1')).toMatchObject({ townChances: 1, townVotesSheriff: 1, townVotesMafia: 0 });
    expect(stats.get('p4')).toMatchObject({ townChances: 1, townVotesMafia: 1 });
    // Seat 6 voted for the Don, who was nominated but never revealed: no chance, no vote counted.
    expect(stats.get('p6')).toMatchObject({ townVotesDon: 0 });
  });

  it('ignores games without reveals or a chronology', () => {
    const stats = buildRevealStats([game([]), game([ev(2, 'nomination', { seat: 3, by: 1 })], 'x')]);
    expect(stats.get('p3')).toMatchObject({ sheriffGames: 1, sheriffReveals: 0, townChances: 0 });
    expect(stats.get('p2')).toMatchObject({ blackGames: 1, blackReveals: 0 }); // the game without events is not counted twice
  });
});

describe("the owner's example: the Don 3 reveals against the Sheriff 4", () => {
  // Blacks 1, 2 and the Don 3; the Sheriff 4 (checked 1); the Don reveals against him and announces a black check on 5.
  const exampleSeats = [
    { seat: 1, role: 'mafia' as const, playerId: 'm1' }, { seat: 2, role: 'mafia' as const, playerId: 'm2' }, { seat: 3, role: 'don' as const, playerId: 'don' },
    { seat: 4, role: 'sheriff' as const, playerId: 'sher' }, { seat: 5, role: 'citizen' as const, playerId: 'c5' }, { seat: 6, role: 'citizen' as const, playerId: 'c6' },
  ];
  const exampleGame = (events: LiveGameEvent[], id = 'x'): StatGame => ({ id, source: 'club', date: '2026-10-12T10:00:00Z', winner: 'red', seats: exampleSeats, events });
  const list = () => { seq = 0; return [
    ev(2, 'reveal', { seat: 4 }), ev(2, 'announced_check', { seat: 4, target: 1, value: 'black' }),
    ev(2, 'reveal', { seat: 3 }), ev(2, 'announced_check', { seat: 3, target: 5, value: 'black' }), ev(2, 'announced_check', { seat: 3, target: 6, value: 'red' }),
  ]; };

  it('counts whom the Don names black (the rival included), whom red, and the bundles', () => {
    const stats = buildRevealStats([exampleGame(list())]).get('don')!;
    expect(stats).toMatchObject({ donGames: 1, blackReveals: 1, blackRevealsDon: 1, donHandedReveal: 0, donNamedBlackRed: 2, donNamedBlackBlack: 0, donNamedRedRed: 1, donNamedRedBlack: 0 });
    expect(stats.donTargets).toEqual({ sher: { black: 1, red: 0 }, c5: { black: 1, red: 0 }, c6: { black: 0, red: 1 } });
    expect(stats.donBundles).toEqual({ 'c5|sher': 1 });
  });

  it('counts a Don who stayed quiet while his mafia partner revealed as having handed the reveal over', () => {
    seq = 0;
    const stats = buildRevealStats([exampleGame([ev(2, 'reveal', { seat: 1 }), ev(2, 'announced_check', { seat: 1, target: 2, value: 'red' })])]);
    expect(stats.get('don')).toMatchObject({ donGames: 1, donHandedReveal: 1, blackReveals: 0 });
    expect(stats.get('m1')).toMatchObject({ blackReveals: 1, blackRevealsMafia: 1, blackCovers: 1 });
  });

  it('builds the two competing versions of the table', () => {
    const records = [{ seat: 4, checks: [{ target: 1, color: 'black' as const }] }, { seat: 3, checks: [{ target: 5, color: 'black' as const }] }];
    expect(revealVersions(records)).toEqual([
      { claimant: 4, blacks: [1, 3], reds: [] },
      { claimant: 3, blacks: [4, 5], reds: [] },
    ]);
    expect(revealVersions(records.slice(0, 1))).toEqual([]);
  });
});
