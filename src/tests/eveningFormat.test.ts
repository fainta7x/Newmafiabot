import { describe, expect, it } from 'vitest';
import {
  eveningFormatAffectsElo,
  eveningFormatIsCompetitive,
  normalizeEveningFormat,
} from '../lib/eveningFormat.ts';

describe('evening format semantics', () => {
  it('keeps legacy STANDARD compatible with casual club nights', () => {
    expect(normalizeEveningFormat('STANDARD')).toBe('CASUAL');
  });

  it('keeps casual nights motivating without marking them competitive', () => {
    expect(eveningFormatAffectsElo('CASUAL')).toBe(true);
    expect(eveningFormatIsCompetitive('CASUAL')).toBe(false);
  });

  it('treats rating and tournament nights as competitive Elo formats', () => {
    expect(eveningFormatAffectsElo('RATING')).toBe(true);
    expect(eveningFormatAffectsElo('TOURNAMENT')).toBe(true);
    expect(eveningFormatIsCompetitive('RATING')).toBe(true);
    expect(eveningFormatIsCompetitive('TOURNAMENT')).toBe(true);
  });

  it('keeps novice nights out of Elo', () => {
    expect(eveningFormatAffectsElo('NOVICE')).toBe(false);
    expect(eveningFormatIsCompetitive('NOVICE')).toBe(false);
  });
});
