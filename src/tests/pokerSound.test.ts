import { describe, expect, it } from 'vitest';
import { pokerSoundCues, pokerSoundState } from '../lib/pokerSound.ts';

const hand = (overrides: Record<string, unknown> = {}) => ({
  id: 'h1', street: 'preflop', board: [], action_log: [],
  is_viewer_turn: false, turn_remaining: { base_seconds: 20, reserve_seconds: 60 },
  ...overrides,
});
const state = (h: any, table = 'table1') => pokerSoundState(table, h);

describe('poker sound transitions from the authoritative table snapshot', () => {
  it('is silent on initial mount, refresh and switching tables', () => {
    const current = state(hand());
    expect(pokerSoundCues(null, current)).toEqual([]);
    expect(pokerSoundCues(current, current)).toEqual([]);
    expect(pokerSoundCues(current, state(hand(), 'table2'))).toEqual([]);
  });

  it('plays the very first hand after waiting but not on a fresh page with an already running hand', () => {
    const waiting = state(null);
    const firstDeal = state(hand());
    expect(pokerSoundCues(waiting, firstDeal)).toEqual(['deal']);
    expect(pokerSoundCues(null, firstDeal)).toEqual([]);
  });

  it('plays the card deal once when a new hand appears', () => {
    expect(pokerSoundCues(state(hand()), state(hand({ id: 'h2' })))).toEqual(['deal']);
  });

  it('announces new board cards, chips and the pot winner without repeating on polls', () => {
    const old = state(hand());
    const flop = state(hand({ street: 'flop', board: [1, 2, 3] }));
    expect(pokerSoundCues(old, flop)).toEqual(['board']);
    const bet = state(hand({ street: 'flop', board: [1, 2, 3], action_log: [{ type: 'bet' }] }));
    expect(pokerSoundCues(flop, bet)).toEqual(['chips']);
    expect(pokerSoundCues(bet, bet)).toEqual([]);
    expect(pokerSoundCues(bet, state(hand({ street: 'finished', board: [1, 2, 3], action_log: [{ type: 'bet' }] })))).toEqual(['win']);
  });

  it('never makes a chips sound for check and fold', () => {
    const old = state(hand());
    expect(pokerSoundCues(old, state(hand({ action_log: [{ type: 'check' }] })))).toEqual([]);
    expect(pokerSoundCues(old, state(hand({ action_log: [{ type: 'fold' }] })))).toEqual([]);
  });

  it('signals a new personal turn and only the threshold crossing of the countdown', () => {
    const start = state(hand({ is_viewer_turn: true, turn_remaining: { base_seconds: 20 } }));
    expect(pokerSoundCues(state(hand()), start)).toEqual(['turn']);
    const sixth = state(hand({ is_viewer_turn: true, turn_remaining: { base_seconds: 6 } }));
    const fifth = state(hand({ is_viewer_turn: true, turn_remaining: { base_seconds: 5 } }));
    expect(pokerSoundCues(sixth, fifth)).toEqual(['timer']);
    expect(pokerSoundCues(fifth, fifth)).toEqual([]);
    expect(pokerSoundCues(fifth, state(hand({ is_viewer_turn: true, turn_remaining: { base_seconds: 4 } })))).toEqual([]);
  });
});
