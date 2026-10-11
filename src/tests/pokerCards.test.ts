import { describe, expect, it } from 'vitest';
import { cardIdentity, orderOwnCards, pokerBetStep } from '../components/player/pokerCards.ts';

const seven = { rank: '7', suit: 'hearts' };
const ace = { rank: 'A', suit: 'spades' };

describe('the player\'s own cards', () => {
  it('are laid out high card first from the first card, so each one flies to the slot it keeps', () => {
    expect(orderOwnCards([seven, ace])).toEqual([ace, seven]);
    expect(orderOwnCards([ace, seven])).toEqual([ace, seven]);
    expect(orderOwnCards([{ rank: '10', suit: 'clubs' }, { rank: 'K', suit: 'clubs' }])[0].rank).toBe('K');
  });

  it('have an identity that does not depend on their place: moving a card never rebuilds it', () => {
    expect(cardIdentity(seven)).toBe(cardIdentity({ ...seven }));
    expect(cardIdentity(seven)).not.toBe(cardIdentity(ace));
  });
});

describe('the bet step buttons', () => {
  it('move the bet by half a big blind on every level of the tournament clock', () => {
    expect([20, 30, 40, 60, 80, 100, 150, 300, 2000].map(pokerBetStep)).toEqual([10, 15, 20, 30, 40, 50, 75, 150, 1000]);
    expect(pokerBetStep(1)).toBe(1);
    expect(pokerBetStep(0)).toBe(1);
  });
});
