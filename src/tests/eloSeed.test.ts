import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ELO_SEED, ensureEloSeedSchema } from '../db/ensureEloSeedSchema.ts';
import { eveningFormatAffectsElo } from '../lib/eveningFormat.ts';

const makeDb = () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      elo INTEGER NOT NULL DEFAULT 1000,
      tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    INSERT INTO players (id, nickname, elo, tokens) VALUES ('p1', 'Player', 1450, 0);
  `);
  return {
    sqlite,
    async all(sql: string, params: any[] = []) { return sqlite.prepare(sql).all(...params); },
    async get(sql: string, params: any[] = []) { return sqlite.prepare(sql).get(...params) || null; },
    async run(sql: string, params: any[] = []) {
      const info = sqlite.prepare(sql).run(...params);
      return { lastID: info.lastInsertRowid ?? null, changes: info.changes };
    },
  } as any;
};

describe('Elo seed', () => {
  it('adds a fixed personal seed without replacing the current Elo value', async () => {
    const db = makeDb();
    await ensureEloSeedSchema(db);
    const player = await db.get('SELECT elo, elo_seed, elo_seed_reason, elo_seed_set_at FROM players WHERE id = ?', ['p1']);
    expect(player.elo).toBe(1450);
    expect(player.elo_seed).toBe(DEFAULT_ELO_SEED);
    expect(player.elo_seed_reason).toBeNull();
    expect(player.elo_seed_set_at).toBeNull();
  });

  it('keeps novice games outside canonical Elo while all other club formats remain eligible', () => {
    expect(eveningFormatAffectsElo('NOVICE')).toBe(false);
    expect(eveningFormatAffectsElo('CASUAL')).toBe(true);
    expect(eveningFormatAffectsElo('RATING')).toBe(true);
    expect(eveningFormatAffectsElo('TOURNAMENT')).toBe(true);
  });
});
