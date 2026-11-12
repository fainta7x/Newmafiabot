import type { DatabaseWrapper } from '../../db/index.ts';
import { oncePerDatabase } from '../../db/oncePerDatabase.ts';

/**
 * The day and time of the club's regular games (owner, 2026-11-12: «когда я день поменяю?»). The automatic calendar, the site and the
 * posts read it; evenings that already exist are not moved. Weekday uses JavaScript numbering: 0 Sunday … 6 Saturday.
 */
export type GameSchedule = { weekday: number; novice_first_game: string };
export const DEFAULT_GAME_SCHEDULE: GameSchedule = { weekday: 5, novice_first_game: '19:00' };
export const WEEKDAY_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
/** «в пятницу», «в воскресенье», «во вторник» — for texts that need the day in the accusative. */
export const WEEKDAY_ON = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];

const ensure = oncePerDatabase(async (db: DatabaseWrapper) => {
  await db.run('CREATE TABLE IF NOT EXISTS game_schedule_settings (id INTEGER PRIMARY KEY CHECK(id = 1), body TEXT NOT NULL, updated_at TEXT NOT NULL)');
});

export class GameScheduleError extends Error { constructor(message: string, readonly statusCode = 400) { super(message); } }

export function validateGameSchedule(input: unknown): GameSchedule {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const weekday = Number(raw.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new GameScheduleError('Выберите день недели');
  const time = String(raw.novice_first_game ?? '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  const hours = match ? Number(match[1]) : -1;
  if (!match || hours < 10 || hours > 21 || Number(match[2]) > 59) throw new GameScheduleError('Время первой игры: от 10:00 до 21:59, например 19:00');
  return { weekday, novice_first_game: `${String(hours).padStart(2, '0')}:${match[2]}` };
}

export async function loadGameSchedule(db: DatabaseWrapper): Promise<GameSchedule> {
  await ensure(db);
  const row = await db.get<{ body: string }>('SELECT body FROM game_schedule_settings WHERE id = 1');
  try { return validateGameSchedule(JSON.parse(row?.body || '')); } catch { return { ...DEFAULT_GAME_SCHEDULE }; }
}

export async function saveGameSchedule(db: DatabaseWrapper, input: unknown) {
  await ensure(db);
  const before = await loadGameSchedule(db);
  const schedule = validateGameSchedule(input);
  await db.run(
    'INSERT INTO game_schedule_settings (id, body, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at',
    [JSON.stringify(schedule), new Date().toISOString()],
  );
  // Evenings made earlier stay where they are; the card tells how many upcoming ones are still on the old day.
  const upcoming = await db.all<{ starts_at: string }>("SELECT starts_at FROM game_evenings WHERE status IN ('draft', 'published') AND settled_at IS NULL AND datetime(starts_at) > datetime('now')");
  const onOldDay = before.weekday === schedule.weekday ? 0 : upcoming.filter((row) => new Date(new Date(row.starts_at).getTime() + 3 * 3600_000).getUTCDay() === before.weekday).length;
  return { schedule, upcoming_on_old_day: onOldDay };
}

/** The evening times the automatic calendar uses: briefing 30 minutes before the first game, two one-hour novice games, the club evening right after. */
export function scheduleTimes(schedule: GameSchedule) {
  const [h, m] = schedule.novice_first_game.split(':').map(Number);
  const shift = (minutes: number) => { const total = h * 60 + m + minutes; return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; };
  return { briefing: shift(-30), first_game: schedule.novice_first_game, novice_end: shift(120), club_start: shift(120) };
}
