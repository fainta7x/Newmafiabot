import { beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction, createPokerHand, type PokerCard } from '../server/services/pokerEngine.ts';
import { estimateEquity, exportPokerOpponentStats, observePokerHand, opponentRanges, resetPokerBotMemoryForTests } from '../server/services/pokerBot.ts';

const cards = (values: string[]): PokerCard[] => values.map((value) => ({
  rank: value[0] as PokerCard['rank'],
  suit: ({ c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' } as const)[value[1] as 'c' | 'd' | 'h' | 's'],
}));
const rng = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

describe('poker bot independent audit regressions', () => {
  beforeEach(resetPokerBotMemoryForTests);

  it('strong board ranges reduce overpair equity on a dry river', () => {
    const hole = cards(['Ah', 'Ad']);
    const board = cards(['Qc', '7d', '2s', '9h', '3c']);
    const all = estimateEquity(hole, board, [1], rng(123), 3000);
    const strong = estimateEquity(hole, board, [{ range: 1, boardMin: 0.9 }], rng(123), 3000);
    expect(all).toBeGreaterThan(0.85);
    // Every hand in this board-strength range beats the overpair on the completed river.
    expect(strong).toBe(0);
  });

  it('reads a short preflop all-in call as the same line as a call', () => {
    const hand = createPokerHand({ id: 'short', dealer_seat: 1, players: [
      { id: 'a', nickname: 'a', seat: 1, chips: 1000 },
      { id: 'b', nickname: 'b', seat: 2, chips: 100 },
      { id: 'bot', nickname: 'bot', seat: 3, chips: 1000 },
    ] });
    applyPokerAction(hand, { type: 'all_in' });
    applyPokerAction(hand, { type: 'all_in' });
    const normalCall = structuredClone(hand);
    normalCall.action_log.at(-1)!.type = 'call';
    expect(opponentRanges(hand, hand.players[2])).toEqual(opponentRanges(normalCall, normalCall.players[2]));
    observePokerHand(hand);
    const caller = exportPokerOpponentStats().find((stats) => stats.id === 'b')!;
    expect(caller.pfr).toBe(0);
    expect(caller.preflopShoves).toBe(0);
  });

  it('records a legal short postflop all-in call as passive and preserves bettor aggression', () => {
    const hand = createPokerHand({ id: 'post', dealer_seat: 1, players: [
      { id: 'p1', nickname: 'p1', seat: 1, chips: 50 },
      { id: 'p2', nickname: 'p2', seat: 2, chips: 1000 },
    ] });
    applyPokerAction(hand, { type: 'call' });
    applyPokerAction(hand, { type: 'check' });
    applyPokerAction(hand, { type: 'bet', amount: 100 });
    applyPokerAction(hand, { type: 'all_in' });
    observePokerHand(hand);
    const stats = exportPokerOpponentStats();
    expect(stats.find((row) => row.id === 'p1')).toMatchObject({ postflopAggro: 0, postflopPassive: 1, facedBet: 1 });
    expect(stats.find((row) => row.id === 'p2')).toMatchObject({ postflopAggro: 1 });
  });

  it('resets commitments between streets and keeps genuine all-in raises aggressive', () => {
    observePokerHand({ players: [{ id: 'a' }, { id: 'b' }], action_log: [
      { player_id: 'a', street: 'preflop', type: 'raise', amount: 200 },
      { player_id: 'b', street: 'preflop', type: 'call', amount: 200 },
      { player_id: 'a', street: 'flop', type: 'bet', amount: 20 },
      { player_id: 'b', street: 'flop', type: 'all_in', amount: 80 },
      { player_id: 'a', street: 'flop', type: 'call', amount: 60 },
    ] });
    expect(exportPokerOpponentStats().find((row) => row.id === 'b')).toMatchObject({ postflopAggro: 1, postflopPassive: 0 });
  });
});

it('benchmark seed repeats cards/policy and observes finished hands in learning mode', async () => {
  const { benchmark } = await import('../scripts/pokerBotBenchmark.ts');
  const options = { seed: 37, learn: true, continuous: true, stack: 1000 };
  const first = benchmark(['loose'], 6, options);
  expect(exportPokerOpponentStats().find((row) => row.id === 'opp0')?.hands).toBe(6);
  expect(benchmark(['loose'], 6, options)).toBe(first);
  expect(exportPokerOpponentStats().find((row) => row.id === 'opp0')?.hands).toBe(6);
});

it('benchmark cards and opponent randomness are independent of bot random consumption', async () => {
  const { benchmark } = await import('../scripts/pokerBotBenchmark.ts');
  const run = (extraDraws: number) => benchmark(['loose'], 8, {
    seed: 19, learn: true, continuous: true, stack: 1000,
    policy: {
      choose: (hand, player, random = Math.random) => {
        for (let index = 0; index < extraDraws; index += 1) random();
        return { type: hand.current_bet > player.committed ? 'call' : 'check' };
      },
      observe: observePokerHand,
      reset: resetPokerBotMemoryForTests,
    },
  });
  expect(run(100)).toBe(run(0));
});
