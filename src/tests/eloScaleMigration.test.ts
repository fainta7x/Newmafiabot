import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureEloSeedSchema } from '../db/ensureEloSeedSchema.ts';
import { applyEloScaleMigration } from '../db/applyEloScaleMigration.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('×5 Elo scale switch', () => {
  it('stretches manual start Elo once and rebuilds the ratings', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await ensureEloSeedSchema(db);
    const now = new Date().toISOString();
    for (const [id, seed] of [['strong', 1100], ['weak', 950], ['plain', 1000]] as const) {
      await db.run(`INSERT INTO players (id,nickname,elo,elo_seed,lifecycle_status,source,created_at,updated_at) VALUES (?,?,?,?,'normal','telegram',?,?)`, [id, id, 1234, seed, now, now]);
    }
    expect(await applyEloScaleMigration(db)).toEqual({ applied: true, seedsScaled: 2 });
    const rows = Object.fromEntries((await db.all<any>('SELECT id, elo, elo_seed FROM players')).map((row) => [row.id, row]));
    expect(rows.strong).toMatchObject({ elo_seed: 1500, elo: 1500 });
    expect(rows.weak).toMatchObject({ elo_seed: 750, elo: 750 });
    expect(rows.plain).toMatchObject({ elo_seed: 1000, elo: 1000 });

    expect(await applyEloScaleMigration(db)).toEqual({ applied: false, seedsScaled: 0 });
    expect((await db.get<any>("SELECT elo_seed FROM players WHERE id = 'strong'"))?.elo_seed).toBe(1500);
  });
});
