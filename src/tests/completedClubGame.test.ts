import { describe, expect, it } from 'vitest';
import { completedClubGameDate, isCompletedClubGamePayload } from '../server/services/completedClubGame.ts';

describe('canonical completed club game projection', () => {
  const row = { created_at: '2026-06-30T20:00:00.000Z', game_date: '2026-06-30', evening_date: '2026-06-30T18:00:00Z' };
  const finished = { kind: 'club_evening_protocol', protocol: { status: 'completed', completed_at: '2026-07-01T00:05:00.000Z' }, player_results: [] };

  it('places a finished game into the period when it finished, not the day the draft was created', () => {
    expect(isCompletedClubGamePayload(finished)).toBe(true);
    expect(completedClubGameDate(finished, row)).toBe('2026-07-01T00:05:00.000Z');
  });

  it('preserves legacy dates for older completed protocols', () => {
    expect(completedClubGameDate({ ...finished, protocol: { status: 'completed' } }, row)).toBe(row.created_at);
    expect(completedClubGameDate({ ...finished, protocol: { status: 'completed', completed_at: 'not a date' } }, row)).toBe(row.created_at);
  });

  it('rejects drafts and invalid result shapes consistently across both statistics services', () => {
    expect(isCompletedClubGamePayload({ ...finished, protocol: { status: 'draft' } })).toBe(false);
    expect(isCompletedClubGamePayload({ ...finished, player_results: null })).toBe(false);
    expect(isCompletedClubGamePayload({ ...finished, kind: 'legacy_protocol' })).toBe(false);
  });
});
