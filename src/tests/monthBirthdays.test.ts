import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensurePlayerProfileIntegritySchema } from '../db/ensurePlayerProfileIntegritySchema.ts';
import { loadMonthBirthdays } from '../server/services/monthBirthdaysService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('birthdays of the month on the organizer home', () => {
  it('lists the Moscow month in day order, with private dates too, without archived players', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await ensurePlayerProfileIntegritySchema(db);
    const add = (id: string, nickname: string, day: number | null, month: number | null, extra = '') => db.run(
      `INSERT INTO players (id,nickname,tokens,birth_day,birth_month,birthday_visibility,created_at,updated_at${extra ? ',lifecycle_status' : ''}) VALUES (?,?,0,?,?,'private','x','x'${extra ? ",'archived'" : ''})`, [id, nickname, day, month]);
    await add('a', 'Алоэ', 20, 11); await add('b', 'Богдан', 3, 11); await add('c', 'Чага', 12, 12); await add('d', 'Без даты', null, null); await add('e', 'Архив', 5, 11, 'archived');
    const data = await loadMonthBirthdays(db, new Date('2026-11-10T09:00:00Z'));
    expect(data.month_label).toBe('ноябре');
    expect(data.items.map((item) => [item.nickname, item.date_label, item.days_left])).toEqual([['Богдан', '3 ноября', -7], ['Алоэ', '20 ноября', 10]]);
  });
  it('uses the Moscow date at the month boundary', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await ensurePlayerProfileIntegritySchema(db);
    await db.run("INSERT INTO players (id,nickname,tokens,birth_day,birth_month,created_at,updated_at) VALUES ('z','Декабрист',0,2,12,'x','x')");
    expect((await loadMonthBirthdays(db, new Date('2026-11-30T21:30:00Z'))).items[0]?.date_label).toBe('2 декабря');
  });
});
