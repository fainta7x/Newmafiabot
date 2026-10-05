import { describe, expect, it } from 'vitest';
import { cardIdentity, orderOwnCards } from '../components/player/pokerCards.ts';

const seven = { rank: '7', suit: 'hearts' };
const ace = { rank: 'A', suit: 'spades' };

describe('the player\'s own cards while they are dealt', () => {
  it('keep the order they arrive in during the deal, so the first card does not move when the second comes', () => {
    expect(orderOwnCards([seven], true)).toEqual([seven]);
    expect(orderOwnCards([seven, ace], true)).toEqual([seven, ace]);
  });

  it('are put high card first once the deal is over', () => {
    expect(orderOwnCards([seven, ace], false)).toEqual([ace, seven]);
    expect(orderOwnCards([{ rank: '10', suit: 'clubs' }, { rank: 'K', suit: 'clubs' }], false)[0].rank).toBe('K');
  });

  it('have an identity that does not depend on their place: moving a card never rebuilds it', () => {
    expect(cardIdentity(seven)).toBe(cardIdentity({ ...seven }));
    expect(cardIdentity(seven)).not.toBe(cardIdentity(ace));
  });
});
