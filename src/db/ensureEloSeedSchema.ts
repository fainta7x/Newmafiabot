import type { DatabaseWrapper } from './index.ts';

export const DEFAULT_ELO_SEED = 1000;

export async function ensureEloSeedSchema(db: DatabaseWrapper): Promise<void> {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  const names = new Set(columns.map((column) => column.name));

  if (!names.has('elo_seed')) {
    await db.run(`ALTER TABLE players ADD COLUMN elo_seed INTEGER NOT NULL DEFAULT ${DEFAULT_ELO_SEED}`);
  }
  if (!names.has('elo_seed_reason')) {
    await db.run('ALTER TABLE players ADD COLUMN elo_seed_reason TEXT');
  }
  if (!names.has('elo_seed_set_at')) {
    await db.run('ALTER TABLE players ADD COLUMN elo_seed_set_at TEXT');
  }

  await db.run(
    'UPDATE players SET elo_seed = ? WHERE elo_seed IS NULL OR elo_seed < 0 OR elo_seed > 10000',
    [DEFAULT_ELO_SEED],
  );
}
