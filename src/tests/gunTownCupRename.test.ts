import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { GUN_TOWN_CUP_RENAMES, GUN_TOWN_CUP_RENAME_MIGRATION, applyGunTownCupRename, revertGunTownCupRename } from '../db/applyGunTownCupRename.ts';

const seed = async (db: ReturnType<typeof createDatabaseConnection>, titles = GUN_TOWN_CUP_RENAMES.map((item) => item.from as string)) => {
  for (const [index, item] of GUN_TOWN_CUP_RENAMES.entries()) {
    await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES (?,?,?,'completed','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`, [item.id, titles[index], `2026-0${index + 1}-01`]);
  }
};
const titles = async (db: ReturnType<typeof createDatabaseConnection>) =>
  (await db.all<any>('SELECT title FROM tournaments ORDER BY date')).map((row) => row.title);

describe('Gun Town Cup titles', () => {
  it('renames the three tournaments to cups 2, 3 and 4 once, and can be reverted', async () => {
    const db = createDatabaseConnection(':memory:');
    await seed(db);
    await applyGunTownCupRename(db);
    await applyGunTownCupRename(db);
    expect(await titles(db)).toEqual(['Gun Town Cup 2', 'Gun Town Cup 3', 'Gun Town Cup 4']);
    expect(await db.all('SELECT 1 FROM migration_history WHERE migration_name = ?', [GUN_TOWN_CUP_RENAME_MIGRATION])).toHaveLength(1);
    expect(await revertGunTownCupRename(db)).toBe(3);
    expect(await titles(db)).toEqual(['Турнир Богдана 1.08', 'Турнир Богдана #2 3.10.2026', 'Gun Town Cup 3']);
  });

  it('leaves a title the organizer already changed by hand', async () => {
    const db = createDatabaseConnection(':memory:');
    await seed(db, ['Мой Кубок', 'Турнир Богдана #2 3.10.2026', 'Gun Town Cup 3']);
    await applyGunTownCupRename(db);
    expect(await titles(db)).toEqual(['Мой Кубок', 'Gun Town Cup 3', 'Gun Town Cup 4']);
  });

  it('does nothing and does not fail when the tournaments are not there', async () => {
    const db = createDatabaseConnection(':memory:');
    await applyGunTownCupRename(db);
    expect(await titles(db)).toEqual([]);
  });
});
