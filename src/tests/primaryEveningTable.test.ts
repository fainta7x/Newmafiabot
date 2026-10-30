import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensurePrimaryEveningTable } from '../server/services/primaryEveningTableService.ts';

describe('automatic primary evening table', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await db.run(`INSERT INTO game_evenings
      (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('evening-main-table','Тестовый вечер','2026-11-06T19:00:00+03:00',
      'Europe/Moscow','CASUAL','draft',20,100,'2026-10-30','2026-10-30')`);
  });
  afterEach(() => db.sqlite.close());

  it('creates exactly one named primary table, with ten places', async () => {
    const first = await ensurePrimaryEveningTable(db, 'evening-main-table');
    const second = await ensurePrimaryEveningTable(db, 'evening-main-table');
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    const tables = await db.all<any>("SELECT name, capacity FROM evening_tables WHERE evening_id='evening-main-table'");
    expect(tables).toEqual([{ name: 'Основной стол', capacity: 10 }]);
  });

  it('preserves an existing custom table and never adds a phantom second one', async () => {
    await db.run(`INSERT INTO evening_tables(id,evening_id,name,format,capacity,created_at,updated_at)
      VALUES('manual','evening-main-table','Стол организатора','CASUAL',10,'2026-10-30','2026-10-30')`);
    expect(await ensurePrimaryEveningTable(db, 'evening-main-table')).toEqual({ id: 'manual', created: false });
    expect((await db.all<any>("SELECT id FROM evening_tables WHERE evening_id='evening-main-table'")).length).toBe(1);
  });
});
