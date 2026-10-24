import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureEloSeedSchema } from '../db/ensureEloSeedSchema.ts';
import { applyEloTableLevelMigration } from '../server/dataMigrations/applyEloTableLevelMigration.ts';
import { calculateCanonicalEloGame, EXPECTATION_DIVISOR, PROTECTION_DIVISOR } from '../server/services/eloRatingService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('table level uses unstretched distances (owner, 2026-10-24)', () => {
  it('keeps the distances at 400 / 200', () => {
    expect(EXPECTATION_DIVISOR).toBe(400);
    expect(PROTECTION_DIVISOR).toBe(200);
  });

  it('a 200-point table gap is a real level: red expectation moves from 0.30 to about 0.54 and back', () => {
    const table = (redElo: number, blackElo: number) => Array.from({ length: 10 }, (_, i) => ({ playerId: `p${i}`, team: (i < 7 ? 'red' : 'black') as 'red' | 'black', elo: i < 7 ? redElo : blackElo, canonicalPersonalGamePoints: 0 }));
    const equal = calculateCanonicalEloGame(table(1000, 1000), 'red')[0].expectedTeamResult;
    const redStronger = calculateCanonicalEloGame(table(1100, 900), 'red')[0].expectedTeamResult;
    const redWeaker = calculateCanonicalEloGame(table(900, 1100), 'red')[0].expectedTeamResult;
    expect(equal).toBeCloseTo(0.30, 6);
    expect(redStronger).toBeGreaterThan(0.5);
    expect(redWeaker).toBeLessThan(0.17);
  });

  it('rebuilds the ratings once', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await ensureEloSeedSchema(db);
    expect(await applyEloTableLevelMigration(db)).toEqual({ applied: true });
    expect(await applyEloTableLevelMigration(db)).toEqual({ applied: false });
  });
});
