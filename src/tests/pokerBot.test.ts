import { beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction, createPokerHand, type PokerCard, type PokerState } from '../server/services/pokerEngine.ts';
import {
  chooseStrongBotAction,
  estimateEquity,
  handPercentile,
  icmEquity,
  icmRiskPremium,
  observePokerHand,
  pokerOpponentProfile,
  resetPokerBotMemoryForTests,
} from '../server/services/pokerBot.ts';

const c = (text: string): PokerCard => ({ rank: text[0] as PokerCard['rank'], suit: ({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const)[text[1] as 's'] });
const table = (count: number) => createPokerHand({ id: 'h', dealer_seat: 1, players: Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, seat: i + 1, chips: 2000 })) });
const current = (hand: PokerState) => hand.players.find((player) => player.seat === hand.current_seat)!;
const fixed = (value: number) => () => value;

describe('strong poker bots', () => {
  beforeEach(() => resetPokerBotMemoryForTests());

  it('orders starting hands like preflop charts', () => {
    expect(handPercentile([c('As'), c('Ad')])).toBeLessThan(0.01);
    expect(handPercentile([c('Ks'), c('Ah')])).toBeLessThan(0.06);
    expect(handPercentile([c('7s'), c('2d')])).toBeGreaterThan(0.9);
  });

  it('opens aces from early position and folds junk to a raise', () => {
    const hand = table(6);
    const first = current(hand);
    hand.hole_cards[first.id] = [c('As'), c('Ah')];
    expect(['bet', 'all_in']).toContain(chooseStrongBotAction(hand, first, fixed(0.5)).type);

    applyPokerAction(hand, { type: 'bet', amount: 60 });
    const next = current(hand);
    hand.hole_cards[next.id] = [c('7d'), c('2c')];
    expect(chooseStrongBotAction(hand, next, fixed(0.99)).type).toBe('fold');
  });

  it('values the nuts on the river and folds air to a pot-size bet', () => {
    const hand = table(2);
    hand.street = 'river';
    hand.board = [c('Ts'), c('Js'), c('Qs'), c('2d'), c('3c')];
    hand.pot = 400;
    hand.current_bet = 0;
    hand.players.forEach((player) => { player.committed = 0; });
    const bot = current(hand);
    hand.hole_cards[bot.id] = [c('As'), c('Ks')];
    expect(['bet', 'all_in']).toContain(chooseStrongBotAction(hand, bot, fixed(0.9)).type);

    hand.hole_cards[bot.id] = [c('4h'), c('5h')];
    hand.current_bet = 400;
    hand.pot = 800;
    expect(chooseStrongBotAction(hand, bot, fixed(0.99)).type).toBe('fold');
  });

  it('estimates equity sensibly', () => {
    const aces = estimateEquity([c('As'), c('Ah')], [], [1], Math.random, 400);
    expect(aces).toBeGreaterThan(0.75);
    const nuts = estimateEquity([c('As'), c('Ks')], [c('Ts'), c('Js'), c('Qs')], [1], Math.random, 200);
    expect(nuts).toBe(1);
  });

  it('always plays legal moves through whole hands at a full table', () => {
    for (let round = 0; round < 60; round += 1) {
      const hand = table(6);
      let guard = 0;
      while (hand.street !== 'finished' && hand.current_seat !== null && guard < 200) {
        const bot = current(hand);
        expect(() => applyPokerAction(hand, chooseStrongBotAction(hand, bot))).not.toThrow();
        guard += 1;
      }
      expect(hand.street).toBe('finished');
      expect(hand.players.reduce((sum, player) => sum + player.chips, 0)).toBe(12000);
      observePokerHand(hand);
    }
    // 60 whole hands of Monte-Carlo play take ~14 s; the global 15 s limit failed under the load of the full suite.
  }, 60_000);

  it('learns that a player folds to bets', () => {
    for (let round = 0; round < 12; round += 1) {
      observePokerHand({
        players: [{ id: 'nit' }, { id: 'bot' }],
        action_log: [
          { player_id: 'bot', type: 'bet', street: 'flop' },
          { player_id: 'nit', type: 'fold', street: 'flop' },
        ],
      } as unknown as PokerState);
    }
    const profile = pokerOpponentProfile('nit');
    expect(profile.known).toBe(true);
    // The population prior (45%) is blended in, so 12 folds out of 12 read as about 75%.
    expect(profile.foldToBet).toBeGreaterThan(0.7);
  });

  it('computes ICM for tournaments and a risk premium near the money', () => {
    const equal = icmEquity([100, 100, 100], [50, 30, 20]);
    equal.forEach((share) => expect(share).toBeCloseTo(100 / 3, 5));
    const shares = icmEquity([500, 300, 200], [50, 30, 20]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(100, 5);
    expect(shares[0]).toBeLessThan(50);

    const hand = table(3);
    const bot = hand.players[1];
    expect(icmRiskPremium(hand, bot, [50, 30, 20])).toBeGreaterThan(0);
    expect(icmRiskPremium(hand, bot, [100])).toBeGreaterThanOrEqual(0);
  });
});
