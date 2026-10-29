import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadClubHygiene } from '../server/services/clubHygieneService.ts';
import { recordAgendaContact } from '../server/services/organizerAgendaService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const seed = async () => {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const stamp = '2026-10-29T00:00:00.000Z';
  await db.run(`INSERT INTO players (id,nickname,full_name,telegram_user_id,birth_day,birth_month,birthday_visibility,created_at,updated_at) VALUES
    ('full','Полный','Иван','1',3,11,'full',?,?),
    ('bare','Пустой',NULL,NULL,NULL,NULL,'private',?,?),
    ('hid','Скрытный','Пётр','2',5,5,'private',?,?)`, [stamp, stamp, stamp, stamp, stamp, stamp]);
  return db;
};
const byKey = (data: Awaited<ReturnType<typeof loadClubHygiene>>) => Object.fromEntries(data.categories.map((c) => [c.key, c.people.map((p: any) => p.nickname)]));

describe('club hygiene (owner, 2026-10-29)', () => {
  it('lists each gap in its own category', async () => {
    const db = await seed();
    const lists = byKey(await loadClubHygiene(db));
    expect(lists.birthday).toEqual(['Пустой']);
    expect(lists.birthday_private).toEqual(['Скрытный']);
    expect(lists.full_name).toEqual(['Пустой']);
    expect(lists.no_contact).toEqual(['Пустой']);
    expect(lists.telegram).toEqual(['Пустой']);
    expect(lists.avatar).toEqual(expect.arrayContaining(['Пустой', 'Скрытный']));
  });

  it('«Написал» takes the person out of every category for the quiet period and counts them as hidden', async () => {
    const db = await seed();
    await recordAgendaContact(db, { playerId: 'bare', reason: 'profile' });
    const data = await loadClubHygiene(db);
    expect(byKey(data).birthday).toEqual([]);
    expect(data.categories.find((c) => c.key === 'birthday')?.hidden).toBe(1);
  });

  it('leaves players who stopped coming out of the roster check', async () => {
    const db = await seed();
    await db.run("UPDATE players SET stopped_attending = 1 WHERE id = 'bare'");
    expect(byKey(await loadClubHygiene(db)).birthday).toEqual([]);
  });
});
