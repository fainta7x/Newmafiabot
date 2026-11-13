import { describe, expect, it } from 'vitest';
import { calendarSeasonForDate } from '../server/services/clubSeasonService.ts';
import { seasonSummaryCaption, seasonSummaryDueAt, runSeasonSummaryPosts } from '../server/services/seasonSummaryPostService.ts';
import { createDatabaseConnection } from '../db/index.ts';

const autumn = calendarSeasonForDate(Date.UTC(2026, 9, 15));

describe('season results post', () => {
  it('is due at 12:00 Moscow the day after the last game day of the season', () => {
    // Autumn 2026 ends 30 November (Monday); the last Friday is 27 November, so the post is due on Saturday 28 November at 12:00 Moscow.
    expect(new Date(seasonSummaryDueAt(autumn, 5)).toISOString()).toBe('2026-11-28T09:00:00.000Z');
    // Game day moved to Thursday: the last one is 26 November, the post is due the next day.
    expect(new Date(seasonSummaryDueAt(autumn, 4)).toISOString()).toBe('2026-11-27T09:00:00.000Z');
  });

  it('keeps the caption short and points at the site', () => {
    const person = (nickname: string, value: string) => ({ playerId: nickname, nickname, avatar: null, value, detail: '' });
    const text = seasonSummaryCaption({ title: 'Осень 2026', games: 50, evenings: 9, players: 30, eloUp: [person('Богданчик', '+84')], mvp: [person('Дина', '4 вечера')] });
    expect(text).toContain('Итоги сезона «Осень 2026»');
    expect(text).toContain('50 игр · 9 вечеров · 30 игроков');
    expect(text).toContain('Лидер роста по Эло: Богданчик (+84)');
    expect(text).toContain('MVP сезона: Дина (4 вечера)');
    // No leaders (an empty season half): the lines simply are not written.
    expect(seasonSummaryCaption({ title: 'Зима', games: 3, evenings: 1, players: 8, eloUp: [], mvp: [] })).not.toContain('Лидер');
  });

  it('posts nothing before the due moment and nothing for a season without games', async () => {
    const db = createDatabaseConnection(':memory:');
    const fetcher = (async () => new Response('{}')) as unknown as typeof fetch;
    expect(await runSeasonSummaryPosts(db, fetcher, Date.UTC(2026, 10, 20, 12))).toBe(0);
    expect(await runSeasonSummaryPosts(db, fetcher, Date.UTC(2026, 10, 28, 10))).toBe(0);
  });
});
