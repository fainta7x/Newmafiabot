import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceStreet, applyPokerAction, createPokerHand } from '../server/services/pokerEngine.ts';

const players = [
  { id: 'p1', nickname: 'Первый', seat: 1, chips: 1000 },
  { id: 'p2', nickname: 'Второй', seat: 2, chips: 1000 },
];

describe('poker engine', () => {
  afterEach(() => vi.useRealTimers());
  it('deals unique hole cards and burns before every community street', () => {
    const hand = createPokerHand({ id: 'h1', players });
    expect(hand.street).toBe('preflop');
    expect(hand.board).toHaveLength(0);
    expect(hand.burn_cards).toHaveLength(0);
    expect(new Set(Object.values(hand.hole_cards).flat().map((card) => `${card.rank}:${card.suit}`)).size).toBe(4);
    advanceStreet(hand, hand.deck);
    expect(hand.street).toBe('flop'); expect(hand.board).toHaveLength(3); expect(hand.burn_cards).toHaveLength(1);
    advanceStreet(hand, hand.deck);
    expect(hand.street).toBe('turn'); expect(hand.board).toHaveLength(4); expect(hand.burn_cards).toHaveLength(2);
    advanceStreet(hand, hand.deck);
    expect(hand.street).toBe('river'); expect(hand.board).toHaveLength(5); expect(hand.burn_cards).toHaveLength(3);
    const all = [...Object.values(hand.hole_cards).flat(), ...hand.board, ...hand.burn_cards].map((card) => `${card.rank}:${card.suit}`);
    expect(new Set(all).size).toBe(all.length);
  });

  it('supports the requested 2 to 8 players', () => {
    const eight = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, nickname: `P${index}`, seat: index, chips: 1000 }));
    expect(createPokerHand({ id: 'h8', players: eight }).players).toHaveLength(8);
    expect(() => createPokerHand({ id: 'bad', players: players.slice(0, 1) })).toThrow();
  });

  it('uses heads-up blinds correctly and records every visible action', () => {
    const hand = createPokerHand({ id: 'heads-up', players, dealer_seat: 1 });
    expect(hand.players.find((player) => player.id === 'p1')?.committed).toBe(10);
    expect(hand.players.find((player) => player.id === 'p2')?.committed).toBe(20);
    expect(hand.current_seat).toBe(1);
    expect(hand.action_log.map((action) => action.type)).toEqual(['small_blind', 'big_blind']);
    applyPokerAction(hand, { type: 'call' });
    expect(hand.action_log.at(-1)).toMatchObject({ player_id: 'p1', type: 'call', amount: 10 });
    applyPokerAction(hand, { type: 'check' });
    expect(hand.action_log.at(-1)).toMatchObject({ player_id: 'p2', type: 'check', amount: 0 });
    expect(hand.street).toBe('flop');
  });

  it('starts with 60 seconds reserve and restores exactly one second after a base-time turn', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const hand = createPokerHand({ id: 'timer', players });
    const current = hand.players.find((player) => player.seat === hand.current_seat)!;
    current.reserve_seconds = 45;
    vi.advanceTimersByTime(5_000);
    const { applyPokerAction } = await import('../server/services/pokerEngine.ts');
    applyPokerAction(hand, { type: 'call' });
    expect(current.reserve_seconds).toBe(46);
  });
});
