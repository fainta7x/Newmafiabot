import { describe, expect, it } from 'vitest';
import { validateFirstKilled, validateShots } from '../server/routes/tournamentProtocolRoutes.ts';

describe('tournament protocol validators accept what the live engine records', () => {
  it('accepts a night where the mafia did not shoot (no target seat)', () => {
    expect(validateShots([{ night_number: 1, target_seat: 0, result: 'agreement_failed' }])).toBeNull();
    expect(validateShots([{ night_number: 1, result: 'agreement_failed' }])).toBeNull();
  });

  it('still requires a seat for a real shot', () => {
    expect(validateShots([{ night_number: 1, target_seat: 0, result: 'killed' }])).not.toBeNull();
    expect(validateShots([{ night_number: 1, target_seat: 11, result: 'miss' }])).not.toBeNull();
  });

  it('needs no first-killed when the first-night victim is black, but does for a red victim', () => {
    const seats = [{ participant_id: 'p1', seat_number: 1, role: 'mafia' }, { participant_id: 'p2', seat_number: 2, role: 'citizen' }];
    expect(validateFirstKilled(null, seats, [], [{ night_number: 1, target_seat: 1, result: 'killed' }])).toBeNull();
    expect(validateFirstKilled(null, seats, [], [{ night_number: 1, target_seat: 2, result: 'killed' }])).not.toBeNull();
  });
});
