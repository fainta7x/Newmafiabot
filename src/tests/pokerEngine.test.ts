import { afterEach, describe, expect, it, vi } from 'vitest';
import { advancePokerAnimation, advanceStreet, applyPokerAction, createPokerHand, POKER_DEAL_CARD_MS, POKER_DEAL_SETTLE_MS, refreshPokerReserve } from '../server/services/pokerEngine.ts';

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

  it('locks actions until the server-synchronized pocket-card deal completes', () => {
    vi.useFakeTimers(); vi.setSystemTime(10_000);
    const hand = createPokerHand({ id: 'animated-deal', players, animate: true });
    expect(hand).toMatchObject({ animation_phase: 'dealing', current_seat: null });
    expect(() => applyPokerAction(hand, { type: 'call' })).toThrow('Дождитесь окончания раздачи');
    advancePokerAnimation(hand, 10_000 + players.length * 2 * POKER_DEAL_CARD_MS + POKER_DEAL_SETTLE_MS);
    expect(hand.animation_phase).toBe('playing');
    expect(hand.current_seat).not.toBeNull();
    expect(hand.turn_started_at).toBe(10_000 + players.length * 2 * POKER_DEAL_CARD_MS + POKER_DEAL_SETTLE_MS);
  });

  it('reveals an all-in board one card at a time before showdown', () => {
    vi.useFakeTimers(); vi.setSystemTime(20_000);
    const hand = createPokerHand({ id: 'animated-runout', players, animate: true });
    advancePokerAnimation(hand, hand.animation_next_at!);
    applyPokerAction(hand, { type: 'all_in' });
    applyPokerAction(hand, { type: 'call' });
    expect(hand).toMatchObject({ animation_phase: 'runout', street: 'preflop', board: [], current_seat: null });
    expect(hand.revealed_ids).toEqual(hand.players.map((item) => item.id));
    expect(() => applyPokerAction(hand, { type: 'check' })).toThrow('Дождитесь окончания раздачи');

    const first = hand.animation_next_at!;
    advancePokerAnimation(hand, first);
    expect(hand.street).toBe('flop'); expect(hand.board).toHaveLength(1); expect(hand.winner_ids).toEqual([]);
    advancePokerAnimation(hand, hand.animation_next_at!);
    expect(hand.board).toHaveLength(2);
    advancePokerAnimation(hand, hand.animation_next_at!);
    expect(hand.board).toHaveLength(3);
    advancePokerAnimation(hand, hand.animation_next_at!);
    expect(hand.street).toBe('turn'); expect(hand.board).toHaveLength(4);
    advancePokerAnimation(hand, hand.animation_next_at!);
    expect(hand.street).toBe('river'); expect(hand.board).toHaveLength(5); expect(hand.revealed_ids).toHaveLength(2); expect(hand.winner_ids).toEqual([]);
    advancePokerAnimation(hand, hand.animation_next_at!);
    expect(hand.street).toBe('finished'); expect(hand.revealed_ids).toHaveLength(2); expect(hand.winner_ids.length).toBeGreaterThan(0);
  });

  it('recovers reserve only by completed offline minutes and never while the turn is active', () => {
    const hand = createPokerHand({ id: 'recovery', players });
    const player = hand.players[0];
    player.reserve_seconds = 12;
    player.reserve_recovery_at = 1_000;
    refreshPokerReserve(player, 121_000, true, 60);
    expect(player.reserve_seconds).toBe(14);
    refreshPokerReserve(player, 600_000, false, 60);
    expect(player.reserve_seconds).toBe(14);
    refreshPokerReserve(player, 659_000, true, 60);
    expect(player.reserve_seconds).toBe(14);
    refreshPokerReserve(player, 721_000, true, 60);
    expect(player.reserve_seconds).toBe(16);
  });

  it('initializes a missing legacy recovery checkpoint only once', () => {
    const hand = createPokerHand({ id: 'legacy-recovery', players });
    const player = hand.players[0];
    player.reserve_seconds = 12;
    delete player.reserve_recovery_at;
    refreshPokerReserve(player, 1_000, true, 60);
    expect(player).toMatchObject({ reserve_seconds: 12, reserve_recovery_at: 1_000 });
    refreshPokerReserve(player, 61_000, true, 60);
    expect(player).toMatchObject({ reserve_seconds: 13, reserve_recovery_at: 61_000 });
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

  it('keeps the awarded pot amount for the winner animation', () => {
    const hand = createPokerHand({ id: 'award', players });
    expect(hand.pot).toBe(30);
    applyPokerAction(hand, { type: 'fold' });
    expect(hand.street).toBe('finished');
    expect(hand.pot).toBe(0);
    expect(hand.last_pot_awarded).toBe(30);
    expect(hand.winner_ids).toHaveLength(1);
  });
});
