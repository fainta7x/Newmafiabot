import { beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction, createPokerHand, type PokerCard, type PokerState } from '../server/services/pokerEngine.ts';
import { chooseStrongBotAction, observePokerHand, opponentRanges, resetPokerBotMemoryForTests, stackPressure } from '../server/services/pokerBot.ts';

const c = (text: string): PokerCard => ({ rank: text[0] as PokerCard['rank'], suit: ({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const)[text[1] as 's'] });
const current = (hand: PokerState) => hand.players.find((player) => player.seat === hand.current_seat)!;
const headsUp = () => createPokerHand({ id: 'h', dealer_seat: 1, players: [1, 2].map((seat) => ({ id: `p${seat}`, nickname: `P${seat}`, seat, chips: 4000, is_bot: true })) });
/** A fixed random source, so the Monte Carlo equity is the same every run. */
const seeded = () => { let x = 7; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; };

/** Heads-up to the flop with a pot of 7 big blinds; returns the hand with the first player to act on the flop. */
const toFlop = () => {
  const hand = headsUp();
  applyPokerAction(hand, { type: 'bet', amount: 70 });
  applyPokerAction(hand, { type: 'call' });
  return hand;
};

describe('bots weigh the price and the size, not only the line (owner, 2026-10-07)', () => {
  beforeEach(() => resetPokerBotMemoryForTests());

  it('always calls a tiny bet: one big blind into a pot of seven', () => {
    const hand = toFlop();
    expect(hand.street).toBe('flop');
    hand.board = [c('As'), c('Kd'), c('Qh')];
    const bettor = current(hand);
    applyPokerAction(hand, { type: 'bet', amount: hand.big_blind });
    const bot = current(hand);
    expect(bot.id).not.toBe(bettor.id);
    hand.hole_cards[bot.id] = [c('7c'), c('2d')];
    expect(chooseStrongBotAction(hand, bot, seeded()).type).not.toBe('fold');
  });

  it('reads a tiny bet as a much wider range than a half-pot bet', () => {
    const rangeAfter = (amount: number) => {
      const hand = toFlop();
      hand.board = [c('9s'), c('6d'), c('2h')];
      applyPokerAction(hand, { type: 'bet', amount });
      const observer = current(hand);
      return opponentRanges(hand, observer)[0];
    };
    const tiny = rangeAfter(20);
    const half = rangeAfter(70);
    expect(tiny.range).toBeGreaterThan(half.range);
    expect(tiny.boardMin || 0).toBeLessThan(half.boardMin || 0);
  });

  it('calls a min-raise over its open with a playable hand but folds junk to a big re-raise', () => {
    const answer = (reraiseTo: number, cards: PokerCard[]) => {
      const hand = headsUp();
      const opener = current(hand);
      applyPokerAction(hand, { type: 'bet', amount: 40 });
      applyPokerAction(hand, { type: 'bet', amount: reraiseTo });
      expect(current(hand).id).toBe(opener.id);
      hand.hole_cards[opener.id] = cards;
      return chooseStrongBotAction(hand, current(hand), seeded()).type;
    };
    expect(answer(60, [c('Kc'), c('9d')])).not.toBe('fold');
    expect(answer(180, [c('7c'), c('2d')])).toBe('fold');
  });

  it('calls a «push any two» player with K9o and QJ, folds 72o, and stays tight against an unknown shove', () => {
    // p1 has moved all-in before the flop in 30 hands out of 30.
    for (let index = 0; index < 30; index += 1) observePokerHand({ players: [{ id: 'p1' }, { id: 'p2' }], action_log: [{ player_id: 'p1', street: 'preflop', type: 'all_in' }, { player_id: 'p2', street: 'preflop', type: 'fold' }] });
    const answer = (shoverId: string, cards: PokerCard[]) => {
      const hand = createPokerHand({ id: 'h', dealer_seat: 1, players: [shoverId, 'p2'].map((id, index) => ({ id, nickname: id, seat: index + 1, chips: 1000, is_bot: true })) });
      applyPokerAction(hand, { type: 'all_in' });
      const bot = current(hand);
      hand.hole_cards[bot.id] = cards;
      return chooseStrongBotAction(hand, bot, seeded()).type;
    };
    expect(answer('p1', [c('Kc'), c('9d')])).toBe('call');
    expect(answer('p1', [c('Qs'), c('Jd')])).toBe('call');
    expect(answer('p1', [c('7c'), c('2d')])).toBe('fold');
    expect(answer('stranger', [c('Kc'), c('9d')])).toBe('fold');
  });

  it('plays tighter with a short stack and looser with a deep one', () => {
    const at = (chips: number) => stackPressure(createPokerHand({ id: 'h', dealer_seat: 1, players: [1, 2].map((seat) => ({ id: `p${seat}`, nickname: `P${seat}`, seat, chips, is_bot: true })) }), { chips, committed: 0 } as any);
    const short = at(200);
    const normal = at(1000);
    const deep = at(3000);
    expect(short.looseness).toBeLessThan(normal.looseness);
    expect(deep.looseness).toBeGreaterThan(normal.looseness);
    expect(short.premium).toBeGreaterThan(normal.premium);
    expect(deep.premium).toBeLessThanOrEqual(normal.premium);
  });
});
