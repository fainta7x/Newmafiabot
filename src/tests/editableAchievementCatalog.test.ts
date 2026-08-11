import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ensureAdminDataSchema } from '../db/ensureAdminDataSchema.ts';
import { loadAchievementDefinitions } from '../server/services/playerAchievementsService.ts';

const makeDb = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL);
  `);
  const wrapper: any = {
    sqlite,
    async all(sql: string, params: any[] = []) { return sqlite.prepare(sql).all(...params); },
    async get(sql: string, params: any[] = []) { return sqlite.prepare(sql).get(...params) || null; },
    async run(sql: string, params: any[] = []) {
      const info = sqlite.prepare(sql).run(...params);
      return { lastID: info.lastInsertRowid ?? null, changes: info.changes };
    },
    async exec(sql: string) { sqlite.exec(sql); },
  };
  return wrapper;
};

describe('editable achievement catalog', () => {
  it('seeds the legacy 40 definitions and then reads organizer edits from the database', async () => {
    const db = makeDb();
    await ensureAdminDataSchema(db);

    const seeded = await loadAchievementDefinitions(db, true);
    expect(seeded).toHaveLength(40);
    expect(seeded.find((item) => item.id === 'first_game')?.name).toBe('Первая игра');

    await db.run(
      `UPDATE achievement_definitions
          SET name = ?, description = ?, threshold = ?, updated_at = ?
        WHERE id = 'first_game'`,
      ['Боевой дебют', 'Сыграть 3 игры клуба', 3, new Date().toISOString()],
    );

    const edited = await loadAchievementDefinitions(db);
    const firstGame = edited.find((item) => item.id === 'first_game');
    expect(firstGame?.name).toBe('Боевой дебют');
    expect(firstGame?.description).toBe('Сыграть 3 игры клуба');
    expect(firstGame?.threshold).toBe(3);
  });

  it('hides disabled definitions from the player catalog without deleting them', async () => {
    const db = makeDb();
    await ensureAdminDataSchema(db);
    await db.run("UPDATE achievement_definitions SET active = 0 WHERE id = 'first_game'");

    const active = await loadAchievementDefinitions(db);
    const all = await loadAchievementDefinitions(db, true);
    expect(active.some((item) => item.id === 'first_game')).toBe(false);
    expect(all.some((item) => item.id === 'first_game')).toBe(true);
  });
});
