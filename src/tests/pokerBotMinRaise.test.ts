import { beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction, createPokerHand, type PokerCard, type PokerState } from '../server/services/pokerEngine.ts';
import { chooseStrongBotAction, resetPokerBotMemoryForTests } from '../server/services/pokerBot.ts';

const c = (text: string): PokerCard => ({ rank: text[0] as PokerCard['rank'], suit: ({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const)[text[1] as 's'] });
const table = () => createPokerHand({ id: 'h', dealer_seat: 1, players: Array.from({ length: 4 }, (_, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, seat: i + 1, chips: 4000 })) });
const current = (hand: PokerState) => hand.players.find((player) => player.seat === hand.current_seat)!;
const facing = (openTotal: number) => {
  const hand = table();
  applyPokerAction(hand, { type: 'bet', amount: openTotal });
  const bot = current(hand);
  hand.hole_cards[bot.id] = [c('Ah'), c('9d')];
  return Array.from({ length: 12 }, (_, i) => chooseStrongBotAction(hand, bot, () => (i + 0.5) / 12).type);
};

describe('bots and min-raises', () => {
  beforeEach(() => resetPokerBotMemoryForTests());
  it('does not give a min-raise the credit of a full open', () => {
    const folds = (types: string[]) => types.filter((type) => type === 'fold').length;
    expect(folds(facing(200))).toBeLessThanOrEqual(folds(facing(300)));
  });
});
