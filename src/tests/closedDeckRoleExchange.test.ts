import { describe, expect, it } from 'vitest';
import { exchangeClosedRolesForDraw, type ClosedRoleCard } from '../lib/closedDeckRoleExchange.ts';

const roles = (cards: ClosedRoleCard[]) => cards.map((card) => card.role).sort();
const red = (role: string) => role === 'citizen' || role === 'sheriff';

describe('closed deck exchanges', () => {
  it('preserves a red role for the final player even when others pick red cards first', () => {
    let deck: ClosedRoleCard[] = [
      { id: 1, role: 'citizen' }, { id: 2, role: 'mafia' },
      { id: 3, role: 'don' }, { id: 4, role: 'sheriff' },
    ];
    const original = roles(deck);
    for (const picked of [1, 4, 2]) {
      deck = exchangeClosedRolesForDraw(deck, picked, false, true);
      const drawn = deck.find((card) => card.id === picked)!;
      expect(red(drawn.role) && deck.filter((card) => red(card.role)).length === 1).toBe(false);
      deck = deck.filter((card) => card.id !== picked);
    }
    deck = exchangeClosedRolesForDraw(deck, 3, true, false);
    expect(red(deck[0].role)).toBe(true);
    expect([...original].filter(red)).toHaveLength(2);
  });

  it('guarantees red for a target picking an initially black card', () => {
    const deck: ClosedRoleCard[] = [{ id: 1, role: 'mafia' }, { id: 2, role: 'citizen' }, { id: 3, role: 'don' }];
    const result = exchangeClosedRolesForDraw(deck, 1, true, false);
    expect(result.find((card) => card.id === 1)?.role).toBe('citizen');
    expect(roles(result)).toEqual(roles(deck));
    expect(deck[0].role).toBe('mafia');
  });

  it('does not modify an ordinary draw when no target is pending', () => {
    const deck: ClosedRoleCard[] = [{ id: 1, role: 'citizen' }, { id: 2, role: 'mafia' }];
    expect(exchangeClosedRolesForDraw(deck, 1, false, false)).toEqual(deck);
  });

  it('preserves the full inventory across sequential reveals, including the last red card', () => {
    let deck: ClosedRoleCard[] = [
      { id: 0, role: 'citizen' }, { id: 1, role: 'sheriff' },
      { id: 2, role: 'mafia' }, { id: 3, role: 'don' },
      { id: 4, role: 'citizen' },
    ];
    const initial = roles(deck);
    const revealed: ClosedRoleCard[] = [];
    for (const id of [4, 0, 1, 3, 2]) {
      const target = id === 2;
      deck = exchangeClosedRolesForDraw(deck, id, target, !target);
      const card = deck.find((item) => item.id === id)!;
      if (target) expect(red(card.role)).toBe(true);
      revealed.push(card);
      deck = deck.filter((item) => item.id !== id);
      expect(roles([...revealed, ...deck])).toEqual(initial);
    }
    expect(deck).toHaveLength(0);
  });
});
