import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { calendarSeasonForDate, loadRatingSeasons, previousSeason, seasonForDate } from '../server/services/clubSeasonService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const period = (db: DatabaseWrapper, id: string, title: string, type: string, startsAt: string, endsAt: string, status = 'completed') => db.run(
  `INSERT INTO rating_periods (id, title, type, starts_at, ends_at, status, auto_include, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)`,
  [id, title, type, startsAt, endsAt, status, startsAt, startsAt],
);

describe('club seasons follow rating periods', () => {
  it('uses RATING periods as seasons, ignores novice and draft ones, and falls back to the calendar only without periods', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await createApp(db);
    expect(await loadRatingSeasons(db)).toEqual([]);
    expect(seasonForDate([], Date.UTC(2026, 9, 4)).label).toBe('Осень 2026');

    await period(db, 'p1', 'Лето-осень 2026', 'RATING', '2026-06-01T00:00:00.000Z', '2026-12-31T23:59:59.999Z', 'active');
    await period(db, 'p0', 'Весна 2026', 'RATING', '2026-02-01T00:00:00.000Z', '2026-05-31T23:59:59.999Z');
    await period(db, 'n1', 'Новички', 'NOVICE', '2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.999Z');
    await period(db, 'd1', 'Черновик', 'RATING', '2027-01-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z', 'draft');

    const seasons = await loadRatingSeasons(db);
    expect(seasons.map((s) => s.label)).toEqual(['Весна 2026', 'Лето-осень 2026']);

    const now = seasonForDate(seasons, Date.UTC(2026, 9, 4));
    expect(now.label).toBe('Лето-осень 2026');
    // The period's last instant still belongs to it; the next moment does not.
    expect(seasonForDate(seasons, Date.parse('2026-12-31T23:59:59.999Z')).label).toBe('Лето-осень 2026');
    expect(seasonForDate(seasons, Date.parse('2027-01-01T00:00:00.000Z')).label).toBe(calendarSeasonForDate(Date.UTC(2027, 0, 1)).label);

    expect(previousSeason(seasons, now).label).toBe('Весна 2026');
    const first = seasons[0];
    expect(previousSeason(seasons, first)).toMatchObject({ start: first.start, end: first.start });
  });
});
