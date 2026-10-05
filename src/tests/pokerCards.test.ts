import { describe, expect, it } from 'vitest';
import { cardIdentity, orderOwnCards } from '../components/player/pokerCards.ts';

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
