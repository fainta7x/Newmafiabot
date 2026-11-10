import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePlayerProfileIntegritySchema } from '../../db/ensurePlayerProfileIntegritySchema.ts';

/** Birthdays of the current Moscow month for the organizer's home screen (owner, 2026-11-10). The organizer sees every date that is filled in, whatever the player's visibility setting. */
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_PREPOSITIONAL = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

const moscowParts = (now: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
};

export async function loadMonthBirthdays(db: DatabaseWrapper, now = new Date()) {
  await ensurePlayerProfileIntegritySchema(db);
  const today = moscowParts(now);
  const rows = await db.all<{ id: string; nickname: string; birth_day: number }>(
    `SELECT id, nickname, birth_day FROM players
      WHERE birth_month = ? AND birth_day BETWEEN 1 AND 31
        AND COALESCE(lifecycle_status, '') NOT IN ('merged', 'archived') AND COALESCE(contact_status, '') <> 'archived'
      ORDER BY birth_day, nickname COLLATE NOCASE`,
    [today.month],
  );
  return {
    month: today.month,
    month_label: MONTHS_PREPOSITIONAL[today.month - 1],
    items: rows.map((row) => ({
      player_id: row.id,
      nickname: row.nickname,
      day: Number(row.birth_day),
      date_label: `${Number(row.birth_day)} ${MONTHS_GENITIVE[today.month - 1]}`,
      days_left: Number(row.birth_day) - today.day,
    })),
  };
}
