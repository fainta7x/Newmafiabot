import { describe, expect, it } from 'vitest';
import { protectReservedRolesForDraw } from '../lib/protectReservedRolesForDraw.ts';

const deck = [
  { id: '1', role: 'sheriff' as const },
  { id: '2', role: 'don' as const },
  { id: '3', role: 'mafia' as const },
  { id: '4', role: 'mafia' as const },
  { id: '5', role: 'citizen' as const },
  { id: '6', role: 'citizen' as const },
];
const roles = (cards: typeof deck) => [...cards.map((card) => card.role)].sort();

describe('reserved card protection', () => {
  it('swaps only still-closed cards to guarantee bought sheriff', () => {
    const result = protectReservedRolesForDraw(deck, '5', 3, new Map([[3, 'sheriff']]));
    expect(result.find((card) => card.id === '5')?.role).toBe('sheriff');
    expect(roles(result)).toEqual(roles(deck));
  });
  it('prevents others from taking the last reserved sheriff', () => {
    const result = protectReservedRolesForDraw(deck, '1', 1, new Map([[3, 'sheriff']]));
    expect(result.find((card) => card.id === '1')?.role).not.toBe('sheriff');
    expect(roles(result)).toEqual(roles(deck));
    const after = result.filter((card) => card.id !== '1');
    const later = protectReservedRolesForDraw(after, '2', 3, new Map([[3, 'sheriff']]));
    expect(later.find((card) => card.id === '2')?.role).toBe('sheriff');
  });
  it('protects two different bought roles simultaneously', () => {
    const reservations = new Map([[3, 'sheriff'], [4, 'don']] as const);
    const first = protectReservedRolesForDraw(deck, '1', 1, reservations);
    expect(['sheriff', 'don']).not.toContain(first.find((card) => card.id === '1')?.role);
    const second = protectReservedRolesForDraw(first.filter((card) => card.id !== '1'), '3', 3, reservations);
    expect(second.find((card) => card.id === '3')?.role).toBe('sheriff');
    const third = protectReservedRolesForDraw(second.filter((card) => card.id !== '3'), '5', 4, new Map([[4, 'don']]));
    expect(third.find((card) => card.id === '5')?.role).toBe('don');
  });
  it('never manufactures extra roles or drops cards', () => {
    const result = protectReservedRolesForDraw(deck, '2', 1, new Map([[3, 'don']]));
    expect(result).toHaveLength(deck.length);
    expect(roles(result)).toEqual(roles(deck));
  });
});
