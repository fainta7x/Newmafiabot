import type { DatabaseWrapper } from '../../db/index.ts';

export interface ClubSeason { key: string; label: string; start: number; end: number; }

const tableExists = async (db: DatabaseWrapper, name: string) => Boolean(
  await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`, [name]).catch(() => null),
);

/** Calendar quarter (winter spans Dec–Feb): only the fallback for dates that no rating period covers. */
export const calendarSeasonForDate = (value: number | string | Date): ClubSeason => {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (month === 11) return { key: `winter-${year}-${year + 1}`, label: `Зима ${year}/${String(year + 1).slice(-2)}`, start: Date.UTC(year, 11, 1), end: Date.UTC(year + 1, 2, 1) };
  if (month <= 1) return { key: `winter-${year - 1}-${year}`, label: `Зима ${year - 1}/${String(year).slice(-2)}`, start: Date.UTC(year - 1, 11, 1), end: Date.UTC(year, 2, 1) };
  if (month <= 4) return { key: `spring-${year}`, label: `Весна ${year}`, start: Date.UTC(year, 2, 1), end: Date.UTC(year, 5, 1) };
  if (month <= 7) return { key: `summer-${year}`, label: `Лето ${year}`, start: Date.UTC(year, 5, 1), end: Date.UTC(year, 8, 1) };
  return { key: `autumn-${year}`, label: `Осень ${year}`, start: Date.UTC(year, 8, 1), end: Date.UTC(year, 11, 1) };
};

/** The season is the club's rating period (RATING type, active or completed) — the same one the rating table is built from. */
export const loadRatingSeasons = async (db: DatabaseWrapper): Promise<ClubSeason[]> => {
  if (!(await tableExists(db, 'rating_periods'))) return [];
  const rows = await db.all<any>(
    `SELECT id, title, starts_at, ends_at FROM rating_periods
      WHERE UPPER(type) = 'RATING' AND status IN ('active', 'completed')
      ORDER BY starts_at ASC`,
  ).catch(() => []);
  const seasons: ClubSeason[] = [];
  for (const row of rows) {
    const start = new Date(String(row.starts_at || '')).getTime();
    // The period end is inclusive, season ranges are half-open.
    const end = new Date(String(row.ends_at || '')).getTime() + 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    seasons.push({ key: `period:${row.id}`, label: String(row.title || 'Сезон'), start, end });
  }
  return seasons;
};

export const seasonForDate = (seasons: ClubSeason[], value: number | string | Date): ClubSeason => {
  const ms = new Date(value).getTime();
  const match = seasons.filter((season) => ms >= season.start && ms < season.end).sort((a, b) => b.start - a.start)[0];
  return match || calendarSeasonForDate(ms);
};

export const previousSeason = (seasons: ClubSeason[], season: ClubSeason): ClubSeason => {
  const earlier = seasons.filter((item) => item.end <= season.start).sort((a, b) => b.end - a.end)[0];
  if (earlier) return earlier;
  // With rating periods defined, "before the first one" is simply empty rather than an overlapping calendar quarter.
  if (seasons.length) return { key: 'none', label: 'Предыдущий сезон', start: season.start, end: season.start };
  return calendarSeasonForDate(season.start - 1);
};
