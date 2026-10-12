import { describe, expect, it } from 'vitest';
import {
  createGoMafiaPublicSnapshot,
  normalizeGoMafiaMetric,
  parseGoMafiaPlayerReference,
} from '../lib/gomafiaExternalProfile.ts';

describe('GoMafia public profile identity', () => {
  it('accepts an explicit canonical player URL or numeric ID', () => {
    expect(parseGoMafiaPlayerReference('https://gomafia.pro/stats/218')).toEqual({
      provider: 'gomafia',
      externalPlayerId: '218',
      profileUrl: 'https://gomafia.pro/stats/218',
    });
    expect(parseGoMafiaPlayerReference(' 218 ')).toEqual(parseGoMafiaPlayerReference('https://gomafia.pro/stats/218/'));
  });

  it('does not mistake nickname, another domain or arbitrary URL for a verified identity', () => {
    for (const value of [
      '', 'Диссонанс', '0', '-10', '001', 'https://evil.example/stats/218',
      'http://gomafia.pro/stats/218', 'https://gomafia.pro.evil.example/stats/218',
      'https://gomafia.pro@evil.example/stats/218',
      'https://gomafia.pro/stats/218?redirect=https://evil.example',
      'https://gomafia.pro/rating', 'https://gomafia.pro/stats/218/../../admin',
      'https://gomafia.pro:443/stats/218#extra',
    ]) {
      expect(parseGoMafiaPlayerReference(value), value).toBeNull();
    }
  });

  it('separates GoMafia source and unavailable metrics from internal club values', () => {
    const reference = parseGoMafiaPlayerReference('https://gomafia.pro/stats/218')!;
    const snapshot = createGoMafiaPublicSnapshot(
      reference,
      {
        totalGames: 45,
        overallElo: 2834.72,
        overallWinRatePercent: 44,
        roleGames: { citizen: 30, mafia: 9, sheriff: 5, don: 1 },
        roleWinRatePercent: { citizen: 37, sheriff: 40, mafia: 78, don: 0 },
      },
      '2026-10-12T10:00:00.000Z',
    );
    expect(snapshot.source).toBe('gomafia');
    expect(snapshot.profileUrl).toBe(reference.profileUrl);
    expect(snapshot.totalGames).toBe(45);
    expect(snapshot.tableElo).toBeNull();
    expect(snapshot.roleGames.citizen).toBe(30);
  });

  it('does not silently coerce dubious scraped numbers', () => {
    expect(normalizeGoMafiaMetric('100')).toBeNull();
    expect(normalizeGoMafiaMetric(-1)).toBeNull();
    expect(normalizeGoMafiaMetric(101, { percentage: true })).toBeNull();
    expect(normalizeGoMafiaMetric(2.5, { integer: true })).toBeNull();
    const reference = parseGoMafiaPlayerReference('218')!;
    expect(createGoMafiaPublicSnapshot(reference, { totalGames: -5, overallWinRatePercent: 103 }, '2026-10-12').totalGames).toBeNull();
    expect(() => createGoMafiaPublicSnapshot(reference, {}, 'not-a-date')).toThrow();
  });
});
