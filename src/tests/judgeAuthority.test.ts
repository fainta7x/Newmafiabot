import { describe, expect, it } from 'vitest';
import {
  judgeLevelAllowsEveningFormat,
  judgeLevelAtLeast,
  requiredJudgeLevelForEveningFormat,
} from '../db/ensureJudgeAuthoritySchema.ts';

describe('judge authority hierarchy', () => {
  it('maps evening formats to the minimum authority', () => {
    expect(requiredJudgeLevelForEveningFormat('NOVICE')).toBe('trainee');
    expect(requiredJudgeLevelForEveningFormat('CASUAL')).toBe('host');
    expect(requiredJudgeLevelForEveningFormat('RATING')).toBe('judge');
    expect(requiredJudgeLevelForEveningFormat('TOURNAMENT')).toBe('judge');
  });

  it('inherits lower authority levels', () => {
    expect(judgeLevelAtLeast('trainee', 'trainee')).toBe(true);
    expect(judgeLevelAtLeast('host', 'trainee')).toBe(true);
    expect(judgeLevelAtLeast('judge', 'host')).toBe(true);
    expect(judgeLevelAtLeast('judge', 'judge')).toBe(true);
  });

  it('keeps trainee restricted to novice games', () => {
    expect(judgeLevelAllowsEveningFormat('trainee', 'NOVICE')).toBe(true);
    expect(judgeLevelAllowsEveningFormat('trainee', 'CASUAL')).toBe(false);
    expect(judgeLevelAllowsEveningFormat('trainee', 'RATING')).toBe(false);
    expect(judgeLevelAllowsEveningFormat('trainee', 'TOURNAMENT')).toBe(false);
  });

  it('keeps host out of rating and tournament games', () => {
    expect(judgeLevelAllowsEveningFormat('host', 'NOVICE')).toBe(true);
    expect(judgeLevelAllowsEveningFormat('host', 'CASUAL')).toBe(true);
    expect(judgeLevelAllowsEveningFormat('host', 'RATING')).toBe(false);
    expect(judgeLevelAllowsEveningFormat('host', 'TOURNAMENT')).toBe(false);
  });

  it('allows judge to conduct every club format', () => {
    for (const format of ['NOVICE', 'CASUAL', 'RATING', 'TOURNAMENT']) {
      expect(judgeLevelAllowsEveningFormat('judge', format)).toBe(true);
    }
  });
});
