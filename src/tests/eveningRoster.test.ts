import { describe, expect, it } from 'vitest';
import type { EveningParticipant } from '../lib/api';
import { isEveningGameEligible, sortEveningRoster, toggleParticipantInSeats } from '../lib/eveningRoster';

const participant = (id: string, patch: Partial<EveningParticipant> = {}): EveningParticipant => ({
  id,
  evening_id: 'e1',
  player_id: `p-${id}`,
  nickname: id,
  lifecycle_status: 'regular',
  elo: 1000,
  registration_status: 'registered',
  attendance_status: 'pending',
  arrival_status: 'unknown',
  payment_status: 'unpaid',
  amount_due: 500,
  amount_paid: 0,
  created_at: '',
  updated_at: '',
  ...patch,
});

describe('evening roster without hard table binding', () => {
  it('allows a participant regardless of table_id', () => {
    expect(isEveningGameEligible(participant('A', { table_id: null }))).toBe(true);
    expect(isEveningGameEligible(participant('B', { table_id: 'legacy-table' }))).toBe(true);
  });

  it('excludes cancelled, waitlist and no-show players', () => {
    expect(isEveningGameEligible(participant('A', { registration_status: 'cancelled' }))).toBe(false);
    expect(isEveningGameEligible(participant('B', { registration_status: 'waitlist' }))).toBe(false);
    expect(isEveningGameEligible(participant('C', { attendance_status: 'no_show' }))).toBe(false);
  });

  it('prioritizes attended players, then confirmed players', () => {
    const sorted = sortEveningRoster([
      participant('registered'),
      participant('attended', { attendance_status: 'attended' }),
      participant('confirmed', { registration_status: 'confirmed' }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['attended', 'confirmed', 'registered']);
  });

  it('fills the next free seat and toggles selected player off', () => {
    const start = Array(10).fill('') as string[];
    const one = toggleParticipantInSeats(start, 'a');
    const two = toggleParticipantInSeats(one, 'b');
    expect(two[0]).toBe('a');
    expect(two[1]).toBe('b');
    const removed = toggleParticipantInSeats(two, 'a');
    expect(removed[0]).toBe('');
    expect(removed[1]).toBe('b');
  });
});
