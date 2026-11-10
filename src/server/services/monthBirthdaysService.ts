import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePlayerProfileIntegritySchema } from '../../db/ensurePlayerProfileIntegritySchema.ts';

/**
 * The nearest birthdays for the organizer's home screen (owner, 2026-11-10): the next 45 days, across the month end, by the Moscow date.
 * The organizer sees every date that is filled in, whatever the player's visibility setting.
 */
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const BIRTHDAY_WINDOW_DAYS = 45;
const DAY_MS = 86_400_000;

const moscowParts = (now: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
};

/** Days from today to the next occurrence; 29 February counts as 1 March in a year without it. */
export const daysUntilBirthday = (day: number, month: number, today: { year: number; month: number; day: number }) => {
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const occurrence = (year: number) => {
    const leapDay = month === 2 && day === 29 && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1;
    return Date.UTC(year, leapDay ? 2 : month - 1, leapDay ? 1 : day);
  };
  let next = occurrence(today.year);
  if (next < todayUtc) next = occurrence(today.year + 1);
  return Math.round((next - todayUtc) / DAY_MS);
};

export async function loadMonthBirthdays(db: DatabaseWrapper, now = new Date()) {
  await ensurePlayerProfileIntegritySchema(db);
  const today = moscowParts(now);
  const rows = await db.all<{ id: string; nickname: string; birth_day: number | null; birth_month: number | null }>(
    `SELECT id, nickname, birth_day, birth_month FROM players
      WHERE COALESCE(lifecycle_status, '') NOT IN ('merged', 'archived') AND COALESCE(contact_status, '') <> 'archived'`,
  );
  const withDate = rows.filter((row) => Number(row.birth_day) >= 1 && Number(row.birth_day) <= 31 && Number(row.birth_month) >= 1 && Number(row.birth_month) <= 12);
  const items = withDate
    .map((row) => ({ player_id: row.id, nickname: row.nickname, day: Number(row.birth_day), date_label: `${Number(row.birth_day)} ${MONTHS_GENITIVE[Number(row.birth_month) - 1]}`, days_left: daysUntilBirthday(Number(row.birth_day), Number(row.birth_month), today) }))
    .filter((item) => item.days_left <= BIRTHDAY_WINDOW_DAYS)
    .sort((a, b) => a.days_left - b.days_left || a.nickname.localeCompare(b.nickname, 'ru'));
  return { window_days: BIRTHDAY_WINDOW_DAYS, with_date: withDate.length, total: rows.length, items };
}
