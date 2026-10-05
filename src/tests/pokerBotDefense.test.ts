import { beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction, createPokerHand, type PokerCard, type PokerState } from '../server/services/pokerEngine.ts';
import { chooseStrongBotAction, estimateEquity, resetPokerBotMemoryForTests } from '../server/services/pokerBot.ts';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const deck: PokerCard[] = RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit })));

/** Seeded random so the defence frequencies are stable. */
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

const current = (hand: PokerState) => hand.players.find((player) => player.seat === hand.current_seat)!;

/** Share of random hands with which the bot in `heroSeat` continues against a 2bb open from UTG. */
const defendShare = (heroSeat: number, samples = 400) => {
  const random = seeded(7);
  let continued = 0;
  for (let i = 0; i < samples; i += 1) {
    resetPokerBotMemoryForTests();
    const hand = createPokerHand({ id: `d${i}`, dealer_seat: 6, small_blind: 10, big_blind: 20, players: Array.from({ length: 6 }, (_, k) => ({ id: `p${k + 1}`, nickname: `P${k + 1}`, seat: k + 1, chips: 4000 })) });
    // Seats after the button (seat 6): SB 1, BB 2, UTG 3, MP 4, CO 5, BTN 6. The opener is UTG.
    applyPokerAction(hand, { type: 'bet', amount: 40 });
    while (current(hand).seat !== heroSeat) applyPokerAction(hand, { type: 'fold' });
    const hero = current(hand);
    const cards = [...deck];
    const pick = () => cards.splice(Math.floor(random() * cards.length), 1)[0];
    hand.hole_cards[hero.id] = [pick(), pick()];
    const action = chooseStrongBotAction(hand, hero, seeded(i + 1));
    if (action.type !== 'fold') continued += 1;
  }
  return continued / samples;
};

describe('preflop defence by position', () => {
  beforeEach(() => resetPokerBotMemoryForTests());

  it('defends the big blind against a 2bb open with most hands', () => {
    expect(defendShare(2)).toBeGreaterThan(0.5);
  });

  it('defends the button and the small blind instead of folding everything', () => {
    expect(defendShare(6)).toBeGreaterThan(0.2);
    expect(defendShare(1)).toBeGreaterThan(0.15);
  });
});

describe('equity against ranges narrowed by the board', () => {
  it('values a weak hand lower against a range that fits a strong board than against any hand', () => {
    const hole = [{ rank: '7', suit: 'spades' }, { rank: '8', suit: 'hearts' }] as PokerCard[];
    const board = [{ rank: 'K', suit: 'clubs' }, { rank: '4', suit: 'diamonds' }, { rank: '2', suit: 'spades' }] as PokerCard[];
    const any = estimateEquity(hole, board, [1], seeded(3), 600);
    const strong = estimateEquity(hole, board, [{ range: 1, boardMin: 0.6 }], seeded(3), 600);
    expect(strong).toBeLessThan(any);
  });
});
