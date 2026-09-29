import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureJudgeAuthoritySchema } from '../db/ensureJudgeAuthoritySchema.ts';
import { canOrganizeEveningFormat, canOrganizeTournaments } from '../lib/organizeFormats.ts';

let db: DatabaseWrapper | null = null;
afterEach(() => { try { db?.sqlite.close(); } catch { /* closed */ } db = null; });

describe('«Турниры» is a mark of its own (owner decision 2026-09-29)', () => {
  it('rating evenings and tournaments are separate rights', () => {
    expect(canOrganizeEveningFormat({ organize_formats: 'RATING' }, 'RATING')).toBe(true);
    expect(canOrganizeTournaments({ organize_formats: 'RATING' })).toBe(false);
    expect(canOrganizeTournaments({ organize_formats: 'TOURNAMENT' })).toBe(true);
    expect(canOrganizeEveningFormat({ organize_formats: 'TOURNAMENT' }, 'RATING')).toBe(false);
    expect(canOrganizeEveningFormat({ organize_formats: 'RATING,TOURNAMENT' }, 'TOURNAMENT')).toBe(false);
  });

  it('gives the old «Рейтинг и турниры» holders both marks once', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureJudgeAuthoritySchema(db);
    const now = new Date().toISOString();
    for (const [id, formats] of [['old', 'NOVICE,RATING,CUSTOM'], ['club', 'CASUAL'], ['none', null]] as const) {
      await db.run('INSERT INTO players (id, nickname, organize_formats, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id, id, formats, now, now]);
    }
    await db.run("DELETE FROM app_data_migrations WHERE id = '2026-09-organize-tournament-mark'");
    await ensureJudgeAuthoritySchema(db);
    const read = async () => db!.all<any>('SELECT id, organize_formats FROM players ORDER BY id');
    expect(await read()).toEqual([
      { id: 'club', organize_formats: 'CASUAL' },
      { id: 'none', organize_formats: null },
      { id: 'old', organize_formats: 'NOVICE,RATING,TOURNAMENT,CUSTOM' },
    ]);
    // Later the owner may take «Турниры» away; the next start does not give it back.
    await db.run("UPDATE players SET organize_formats = 'RATING' WHERE id = 'old'");
    await ensureJudgeAuthoritySchema(db);
    expect((await read()).find((row) => row.id === 'old').organize_formats).toBe('RATING');
  });
});
