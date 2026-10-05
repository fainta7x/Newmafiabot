import { beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction, createPokerHand, type PokerState } from '../server/services/pokerEngine.ts';
import { opponentRanges, resetPokerBotMemoryForTests } from '../server/services/pokerBot.ts';

const table = () => createPokerHand({ id: 'h', dealer_seat: 1, players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, seat: i + 1, chips: 5000 })) });
const current = (hand: PokerState) => hand.players.find((player) => player.seat === hand.current_seat)!;

/** The range the bot assigns to the 3-bettor after an open to 2 bb and a re-raise to `threeBetBb` big blinds. */
const threeBettorRange = (threeBetBb: number) => {
  const hand = table();
  const bb = hand.big_blind;
  applyPokerAction(hand, { type: 'bet', amount: bb * 2 });
  const opener = current(hand);
  void opener;
  applyPokerAction(hand, { type: 'bet', amount: bb * threeBetBb });
  const threeBettor = hand.action_log.at(-1)!.player_id;
  const observer = hand.players.find((player) => ![...hand.action_log.map((entry) => entry.player_id)].includes(player.id) && !player.folded)!;
  const ranges = opponentRanges(hand, observer);
  const index = hand.players.filter((player) => player.id !== observer.id && !player.folded).findIndex((player) => player.id === threeBettor);
  return ranges[index].range;
};

describe('bots read a 3-bet by its size and position', () => {
  beforeEach(() => resetPokerBotMemoryForTests());
  it('treats a small 3-bet as a wider range than a standard one', () => {
    expect(threeBettorRange(4)).toBeGreaterThan(threeBettorRange(7));
  });
});

import { drawPotential } from '../server/services/pokerBot.ts';
import type { PokerCard } from '../server/services/pokerEngine.ts';
const c = (text: string): PokerCard => ({ rank: text[0] as PokerCard['rank'], suit: ({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const)[text[1] as 's'] });

describe('draw potential of a hand on the flop', () => {
  it('ranks combo draws above flush or open-ended draws, those above gutshots, and nothing above air', () => {
    const flop = [c('9h'), c('8h'), c('2c')];
    const combo = drawPotential([c('7h'), c('6h')], flop);
    const flush = drawPotential([c('Ah'), c('3h')], flop);
    const open = drawPotential([c('7d'), c('6c')], flop);
    const gut = drawPotential([c('Td'), c('Qc')], [c('9h'), c('8s'), c('2c')]);
    expect(combo).toBeGreaterThan(flush);
    expect(flush).toBeGreaterThanOrEqual(open);
    expect(open).toBeGreaterThan(gut);
    expect(gut).toBeGreaterThan(0);
    expect(drawPotential([c('Kd'), c('3c')], flop)).toBe(0);
  });
});

describe('ranges follow the table size', () => {
  beforeEach(() => resetPokerBotMemoryForTests());
  it('reads an opener at a short table as playing far more hands than at a full one', () => {
    const openerRange = (players: number) => {
      const hand = createPokerHand({ id: 'h', dealer_seat: 1, players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, seat: i + 1, chips: 5000 })) });
      applyPokerAction(hand, { type: 'bet', amount: hand.big_blind * 2 });
      const openerId = hand.action_log.at(-1)!.player_id;
      const observer = hand.players.find((player) => player.id !== openerId)!;
      const others = hand.players.filter((player) => player.id !== observer.id && !player.folded);
      return opponentRanges(hand, observer)[others.findIndex((player) => player.id === openerId)].range;
    };
    expect(openerRange(2)).toBeGreaterThan(openerRange(3));
    expect(openerRange(3)).toBeGreaterThan(openerRange(6));
    expect(openerRange(2)).toBeGreaterThanOrEqual(0.6);
  });
});

import { botStyle } from '../server/services/pokerBot.ts';
describe('hidden bot styles', () => {
  it('spreads styles within 14% of the baseline, differs between bots and is stable for one bot', () => {
    const styles = Array.from({ length: 200 }, (_, index) => botStyle(`bot-${index}-${index * 7919}`));
    expect(Math.min(...styles)).toBeGreaterThanOrEqual(0.86);
    expect(Math.max(...styles)).toBeLessThanOrEqual(1.14);
    expect(Math.max(...styles) - Math.min(...styles)).toBeGreaterThan(0.2);
    expect(botStyle('bot-abc')).toBe(botStyle('bot-abc'));
  });
});
