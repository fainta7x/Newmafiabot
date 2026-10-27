import { describe, expect, it } from 'vitest';
import { selectHomeEvening, type HomeEvening } from '../lib/playerHomeEvening.ts';

const now = Date.parse('2026-10-26T12:00:00Z');
const evening = (id: string, days: number, response = 'unanswered'): HomeEvening => ({
  id, title: id, starts_at: new Date(now + days * 86400000).toISOString(), venue: null, format: 'CASUAL', status: 'published', response_status: response,
});
describe('personal next evening', () => {
  it('prefers the earliest personal booking over a nearer general invitation without mutating input', () => {
    const rows = [evening('later', 8, 'going'), evening('invite', 1), evening('mine', 3, 'late')];
    expect(selectHomeEvening(rows, now)?.id).toBe('mine');
    expect(rows.map((row) => row.id)).toEqual(['later', 'invite', 'mine']);
  });
  it('preserves reservation status independently from RSVP and never turns a decline into a booking', () => {
    const reserved = { ...evening('reserve', 4), participation: { response_status: 'unanswered', registration_status: 'waitlist', attendance_status: 'pending', slot_numbers: [] } };
    expect(selectHomeEvening([evening('invite', 1), reserved], now)?.id).toBe('reserve');
    reserved.participation.response_status = 'declined';
    expect(selectHomeEvening([reserved, evening('invite', 1)], now)?.id).toBe('invite');
  });
  it('keeps an undecided personal answer visible, then offers the nearest available evening', () => {
    expect(selectHomeEvening([evening('invite', 1), evening('thinking', 3, 'thinking')], now)?.id).toBe('thinking');
    expect(selectHomeEvening([evening('declined', 1, 'declined'), evening('invite', 2)], now)?.id).toBe('invite');
  });
  it('excludes running, closed, cancelled and stale evenings, even if personally booked', () => {
    const rows: HomeEvening[] = ['active', 'completed', 'cancelled'].map((status) => ({ ...evening(status, 1, 'going'), status }));
    rows.push(evening('stale', -2, 'going'));
    expect(selectHomeEvening([...rows, evening('next', 3)], now)?.id).toBe('next');
    expect(selectHomeEvening(rows, now)).toBeNull();
  });
});
