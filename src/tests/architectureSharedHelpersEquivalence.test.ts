import { describe, expect, it } from 'vitest';
import { formatPlayerGameDate, formatPlayerGameDateTime } from '../lib/playerGameDate.ts';
import { russianPlural } from '../lib/russianPlural.ts';
import { getPlayerGameRoleLabel } from '../lib/playerGameRoleLabels.ts';

// The private helpers these screens had before they reused the shared ones, copied as they were:
// the shared ones must give exactly the same text for every value the screens can pass.
const oldCardDate = (value?: string | null) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' });
};
const oldDateTime = (value?: string | null) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(date);
};
const oldStaffPlural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10; const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
const oldVisitsWord = (count: number) => (count % 10 === 1 && count % 100 !== 11 ? 'заход' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'захода' : 'заходов');

const values: Array<string | null | undefined> = [
  null, undefined, '', 'not a date', '2026-10-12', '2026-10-12T21:00:00+03:00', '2026-10-12T21:00:00Z', '2026-12-31T23:30:00Z', '2026-01-01T00:00:00Z', '2025-02-28T20:59:59Z',
];

describe('screens that reuse shared helpers show exactly what their own copies showed', () => {
  it.each(values)('Moscow date %s', (value) => {
    expect(formatPlayerGameDate(value)).toBe(oldCardDate(value));
  });
  it.each(values)('Moscow date with time %s', (value) => {
    expect(formatPlayerGameDateTime(value)).toBe(oldDateTime(value));
  });
  it('gives the same noun form for every count a screen shows', () => {
    for (let count = 0; count <= 500; count += 1) {
      expect(russianPlural(count, 'игру', 'игры', 'игр'), `staff ${count}`).toBe(oldStaffPlural(count, 'игру', 'игры', 'игр'));
      expect(russianPlural(count, 'заход', 'захода', 'заходов'), `visits ${count}`).toBe(oldVisitsWord(count));
    }
  });
  it('keeps the role wording and each screen\'s own fallback', () => {
    expect([getPlayerGameRoleLabel('citizen'), getPlayerGameRoleLabel('sheriff'), getPlayerGameRoleLabel('mafia'), getPlayerGameRoleLabel('don')]).toEqual(['Мирный', 'Шериф', 'Мафия', 'Дон']);
    for (const unknown of [null, undefined, '', 'Citizen', 'red']) {
      expect(getPlayerGameRoleLabel(unknown as any) ?? 'Не выбрана').toBe('Не выбрана');
      expect(getPlayerGameRoleLabel(unknown as any) ?? '—').toBe('—');
    }
  });
});
