import { describe, expect, it } from 'vitest';
import { updatePlayerSchema } from '../server/validation.ts';
import { judgeLevelAllowsEveningFormat } from '../db/ensureJudgeAuthoritySchema.ts';

describe('player club role contract', () => {
  it('accepts every supported descriptive club role', () => {
    for (const club_role of ['guest', 'member', 'team', 'organizer'] as const) {
      expect(updatePlayerSchema.parse({ club_role })).toMatchObject({ club_role });
    }
  });

  it('rejects unknown club roles', () => {
    expect(() => updatePlayerSchema.parse({ club_role: 'admin' })).toThrow();
  });
});

describe('judge self-start format authority', () => {
  it('keeps authority scoped by judge level', () => {
    expect(judgeLevelAllowsEveningFormat('trainee', 'NOVICE')).toBe(true);
    expect(judgeLevelAllowsEveningFormat('trainee', 'CASUAL')).toBe(false);
    expect(judgeLevelAllowsEveningFormat('host', 'CASUAL')).toBe(true);
    expect(judgeLevelAllowsEveningFormat('host', 'RATING')).toBe(false);
    expect(judgeLevelAllowsEveningFormat('judge', 'RATING')).toBe(true);
    expect(judgeLevelAllowsEveningFormat('judge', 'TOURNAMENT')).toBe(true);
  });
});
