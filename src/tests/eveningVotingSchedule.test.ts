import { describe, expect, it } from 'vitest';
import { eveningVotingSchedule, isVotingOpen } from '../shared/eveningVotingSchedule.ts';

const msk = (iso: string) => new Date(`${iso}+03:00`).getTime();

describe('«MVP вечера» schedule (owner, 2026-11-09)', () => {
  it('a Friday evening: poll Saturday 12:00, voting to Tuesday 21:00, additional vote to Thursday 21:00', () => {
    // 2026-11-06 is a Friday; the evening starts at 21:00 and is settled at midnight
    const schedule = eveningVotingSchedule({ starts_at: '2026-11-06T21:00:00+03:00', settled_at: '2026-11-06T23:55:00+03:00' })!;
    expect(schedule.openAtMs).toBe(msk('2026-11-07T12:00:00'));
    expect(schedule.deadlineMs).toBe(msk('2026-11-10T21:00:00'));
    expect(schedule.runoffDeadlineMs).toBe(msk('2026-11-12T21:00:00'));
    expect(new Date(schedule.openAtMs).getUTCDay()).toBe(6);
  });

  it('an evening on another day: next day 12:00, 3rd day 21:00, 5th day 21:00', () => {
    // 2026-11-03 is a Tuesday
    const schedule = eveningVotingSchedule({ starts_at: '2026-11-03T19:00:00+03:00', settled_at: '2026-11-03T22:00:00+03:00' })!;
    expect(schedule.openAtMs).toBe(msk('2026-11-04T12:00:00'));
    expect(schedule.deadlineMs).toBe(msk('2026-11-06T21:00:00'));
    expect(schedule.runoffDeadlineMs).toBe(msk('2026-11-08T21:00:00'));
  });

  it('the evening day is the Moscow day: 23:30 Moscow time on Friday is still Friday (UTC says Friday too)', () => {
    const schedule = eveningVotingSchedule({ starts_at: '2026-11-06T20:30:00Z', settled_at: '2026-11-07T00:10:00+03:00' })!; // 23:30 MSK Friday
    expect(schedule.deadlineMs).toBe(msk('2026-11-10T21:00:00'));
  });

  it('an evening closed late is polled right after its closing, and one closed after the end has no poll', () => {
    const sunday = eveningVotingSchedule({ starts_at: '2026-11-06T21:00:00+03:00', settled_at: '2026-11-08T15:00:00+03:00' })!;
    expect(sunday.openAtMs).toBe(msk('2026-11-08T15:00:00'));
    expect(isVotingOpen(sunday, msk('2026-11-08T15:01:00'))).toBe(true);
    const late = eveningVotingSchedule({ starts_at: '2026-11-06T21:00:00+03:00', settled_at: '2026-11-11T09:00:00+03:00' })!;
    expect(late.openAtMs).toBeGreaterThan(late.deadlineMs);
    expect(isVotingOpen(late, msk('2026-11-11T10:00:00'))).toBe(false);
  });

  it('is open from the poll time until the end and not before or after', () => {
    const schedule = eveningVotingSchedule({ starts_at: '2026-11-06T21:00:00+03:00', settled_at: '2026-11-06T23:55:00+03:00' })!;
    expect(isVotingOpen(schedule, msk('2026-11-07T11:59:00'))).toBe(false);
    expect(isVotingOpen(schedule, msk('2026-11-07T12:00:00'))).toBe(true);
    expect(isVotingOpen(schedule, msk('2026-11-10T20:59:00'))).toBe(true);
    expect(isVotingOpen(schedule, msk('2026-11-10T21:00:00'))).toBe(false);
  });

  it('without any time there is no schedule', () => {
    expect(eveningVotingSchedule({})).toBeNull();
    expect(isVotingOpen(null)).toBe(false);
  });
});
