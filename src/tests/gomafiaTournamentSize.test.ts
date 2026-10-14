import { describe, expect, it } from 'vitest';
import { classifyGoMafiaTournamentSize } from '../lib/gomafiaCareer.ts';

describe('GoMafia tournament participant-size boundaries', () => {
  it('puts exactly ten and greater than ten into separate categories', () => {
    expect(classifyGoMafiaTournamentSize(10)).toBe('ten');
    expect(classifyGoMafiaTournamentSize(11)).toBe('large');
    expect(classifyGoMafiaTournamentSize(48)).toBe('large');
    expect(classifyGoMafiaTournamentSize(9)).toBe('other');
  });
  it('does not invent a tournament size when source data is missing', () => {
    for (const count of [null, undefined, 0, -1, 10.5, Number.NaN]) {
      expect(classifyGoMafiaTournamentSize(count)).toBe('unknown');
    }
  });
});
