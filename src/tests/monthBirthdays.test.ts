import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensurePlayerProfileIntegritySchema } from '../db/ensurePlayerProfileIntegritySchema.ts';
import { daysUntilBirthday, loadMonthBirthdays } from '../server/services/monthBirthdaysService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('nearest birthdays on the organizer home', () => {
  it('counts days to the next one, across the year end and for 29 February', () => {
    const today = { year: 2026, month: 11, day: 10 };
    expect(daysUntilBirthday(10, 11, today)).toBe(0);
    expect(daysUntilBirthday(11, 12, today)).toBe(31);
    expect(daysUntilBirthday(5, 1, today)).toBe(56);
    expect(daysUntilBirthday(9, 11, today)).toBe(364);
    expect(daysUntilBirthday(29, 2, { year: 2027, month: 2, day: 20 })).toBe(9); // 1 March
  });

  it('lists the next 45 days in order, with private dates too, without archived players and those without a date', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await ensurePlayerProfileIntegritySchema(db);
    const add = (id: string, nickname: string, day: number | null, month: number | null, archived = false) => db.run(
      `INSERT INTO players (id,nickname,tokens,birth_day,birth_month,birthday_visibility,created_at,updated_at${archived ? ',lifecycle_status' : ''}) VALUES (?,?,0,?,?,'private','x','x'${archived ? ",'archived'" : ''})`, [id, nickname, day, month]);
    await add('a', 'Алоэ', 20, 11); await add('b', 'Богдан', 3, 11); await add('c', 'Чага', 12, 12); await add('d', 'Без даты', null, null); await add('e', 'Архив', 15, 11, true); await add('f', 'Дальний', 20, 3);
    const data = await loadMonthBirthdays(db, new Date('2026-11-10T09:00:00Z'));
    expect(data.items.map((item) => [item.nickname, item.date_label, item.days_left])).toEqual([['Алоэ', '20 ноября', 10], ['Чага', '12 декабря', 32]]);
    expect(data).toMatchObject({ with_date: 4, window_days: 45 });
  });

  it('uses the Moscow date at the month boundary', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await ensurePlayerProfileIntegritySchema(db);
    await db.run("INSERT INTO players (id,nickname,tokens,birth_day,birth_month,created_at,updated_at) VALUES ('z','Декабрист',0,2,12,'x','x')");
    expect((await loadMonthBirthdays(db, new Date('2026-11-30T21:30:00Z'))).items[0]).toMatchObject({ date_label: '2 декабря', days_left: 1 });
  });
});
