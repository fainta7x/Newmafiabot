import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureEloSeedSchema } from '../db/ensureEloSeedSchema.ts';
import { applyEloTableLevelMigration } from '../server/dataMigrations/applyEloTableLevelMigration.ts';
import { calculateCanonicalEloGame, levelGap } from '../server/services/eloRatingService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('table level uses unstretched distances (owner, 2026-10-24)', () => {
  it('levels: up to 150 the same, 150–250 clearly different, above 250 huge', () => {
    expect([0, 100, 150, -150].map(levelGap)).toEqual([0, 0, 0, 0]);
    expect(levelGap(200)).toBe(50);
    expect(levelGap(250)).toBe(100);
    expect(levelGap(300)).toBe(200);
    expect(levelGap(-300)).toBe(-200);
    expect(levelGap(900)).toBe(300);
  });

  it('the red expectation stays equal up to 150 and saturates below 60% for stronger reds', () => {
    const table = (redElo: number, blackElo: number) => Array.from({ length: 10 }, (_, i) => ({ playerId: `p${i}`, team: (i < 7 ? 'red' : 'black') as 'red' | 'black', elo: i < 7 ? redElo : blackElo, canonicalPersonalGamePoints: 0 }));
    const expected = (gap: number) => calculateCanonicalEloGame(table(1000 + gap, 1000), 'red')[0].expectedTeamResult;
    expect(expected(0)).toBeCloseTo(0.30, 6);
    expect(expected(140)).toBeCloseTo(0.30, 6);
    expect(expected(200)).toBeCloseTo(0.373, 2);
    expect(expected(250)).toBeCloseTo(0.439, 2);
    expect(expected(300)).toBeCloseTo(0.528, 2);
    expect(expected(350)).toBeCloseTo(0.572, 2);
    expect(expected(1_000_000)).toBeLessThanOrEqual(0.60);
    expect(expected(-250)).toBeGreaterThan(0.10);
    expect(expected(-250)).toBeLessThan(0.30);
    expect(expected(-350)).toBeCloseTo(0.10, 12);
  });

  it('rebuilds the ratings once', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await ensureEloSeedSchema(db);
    expect(await applyEloTableLevelMigration(db)).toEqual({ applied: true });
    expect(await applyEloTableLevelMigration(db)).toEqual({ applied: false });
  });
});

