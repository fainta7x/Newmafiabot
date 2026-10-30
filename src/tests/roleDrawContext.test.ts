import { describe, expect, it } from 'vitest';
import type { ClubGameRecord } from '../lib/clubGamesApi.ts';
import { roleDrawTargetSeat } from '../lib/roleDrawContext.ts';

const ownerId = 'fad23405-9715-566f-acd9-5632c30eb198';
const sample = (format: string, identity: string, seat = 10) => ({
  evening_format: format,
  club_protocol: { player_results: [{ player_id: identity, seat_number: seat }] },
}) as unknown as ClubGameRecord;

describe('eligible role draw identity', () => {
  it.each(['CASUAL', 'NOVICE'])('resolves canonical player id in %s', (format) => {
    expect(roleDrawTargetSeat(sample(format, ownerId), [1, 2, 10])).toBe(10);
  });

  it.each(['RATING', 'TOURNAMENT', '', 'UNKNOWN'])('never activates in %s', (format) => {
    expect(roleDrawTargetSeat(sample(format, ownerId), [10])).toBeUndefined();
  });

  it('does not trust matching nickname or a missing roster seat', () => {
    expect(roleDrawTargetSeat(sample('CASUAL', 'not-owner'), [10])).toBeUndefined();
    expect(roleDrawTargetSeat(sample('CASUAL', ownerId), [1, 2])).toBeUndefined();
    expect(roleDrawTargetSeat(null, [10])).toBeUndefined();
  });
});
