import type { DatabaseWrapper } from '../../db/index.ts';
import { openEveningSql } from '../../lib/eveningStatus.ts';
import { getWelcomeSiteUrl } from '../runtimeConfig.ts';
import { claim, finish, sendPhotos } from './clubResultPostService.ts';
import { loadSeasonSummary, type SeasonSummary } from './clubResultData.ts';
import { renderPngAsync, seasonNominationsSvg, seasonTop10Svg } from './clubResultImages.ts';
import { calendarSeasonForDate, type ClubSeason } from './clubSeasonService.ts';
import { loadGameSchedule } from './gameScheduleSettingsService.ts';
import { uploadVkWallPhotoBytes } from './announcementPhotoService.ts';
import { createVkWallPost, getVkDestinations, hasVkPublisherToken } from './vkPublishingService.ts';

/**
 * The results of a season of the year go out once, the day after the season's last game day, at 12:00 Moscow (owner, 2026-11-13):
 * the entry Telegram channel, the «Новости» topic of the main group and the VK group wall. The site shows the season by itself.
 */
const TELEGRAM_DESTINATIONS = ['public', 'club_mvp'] as const;
const DAY = 24 * 60 * 60 * 1000;
const CATCH_UP_DAYS = 6;
const WAIT_FOR_OPEN_EVENING_DAYS = 3;

/** The last game day of a season (the game weekday of the club in the season's last week) and the moment its results are due. */
export function seasonSummaryDueAt(season: ClubSeason, weekday: number): number {
  let day = new Date(season.end - DAY);
  while (day.getUTCDay() !== weekday) day = new Date(day.getTime() - DAY);
  // 12:00 Moscow the next day.
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1, 9, 0, 0);
}

const siteLine = () => {
  const site = getWelcomeSiteUrl();
  return site ? `\n\nВсе итоги: ${site.replace(/\/$/, '')}/sezony/` : '';
};

/** The caption from the season's own numbers: nothing invented, only what the pictures show. */
export const seasonSummaryCaption = (summary: Pick<SeasonSummary, 'title' | 'games' | 'evenings' | 'players' | 'eloUp' | 'mvp'>) => {
  const lines = [`🏆 Итоги сезона «${summary.title}»`, '', `${summary.games} игр · ${summary.evenings} вечеров · ${summary.players} игроков`];
  if (summary.eloUp[0]) lines.push(`Лидер роста по Эло: ${summary.eloUp[0].nickname} (${summary.eloUp[0].value})`);
  if (summary.mvp[0]) lines.push(`MVP сезона: ${summary.mvp[0].nickname} (${summary.mvp[0].value})`);
  lines.push('', 'В картинках: таблица топ-10 и номинации.');
  return `${lines.join('\n')}${siteLine()}`;
};

async function postTo(db: DatabaseWrapper, season: ClubSeason, destination: string, run: () => Promise<{ ok: boolean; temporary?: boolean; error?: string }>) {
  const key = `season-summary:${season.key}:${destination}`;
  if (!(await claim(db, key, 'season-summary', '', null))) return false;
  try {
    const result = await run();
    await finish(db, key, result);
    return result.ok;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return false;
  }
}

const vkTarget = () => {
  const vk = getVkDestinations().find((item) => item.key === 'public');
  return vk?.supported && vk.groupId && hasVkPublisherToken() ? vk.groupId : null;
};

/** Destinations of a season that have not finished yet (sent, failed for good or uncertain): the scan draws nothing when there are none. */
async function pendingDestinations(db: DatabaseWrapper, season: ClubSeason) {
  const wanted: string[] = [...TELEGRAM_DESTINATIONS, ...(vkTarget() ? ['vk'] : [])];
  const done = await db.all<any>("SELECT post_key FROM club_result_posts WHERE post_key LIKE ? AND status IN ('sent', 'failed', 'uncertain')", [`season-summary:${season.key}:%`]).catch(() => []);
  const finished = new Set(done.map((row: any) => String(row.post_key).split(':').pop()));
  return wanted.filter((destination) => !finished.has(destination));
}

export async function postSeasonSummary(db: DatabaseWrapper, season: ClubSeason, fetchImpl: typeof fetch = fetch) {
  const destinations = await pendingDestinations(db, season);
  if (!destinations.length) return 0;
  const summary = await loadSeasonSummary(db, season);
  if (!summary) return 0;
  const pngs = [await renderPngAsync(seasonTop10Svg(summary)), await renderPngAsync(seasonNominationsSvg(summary))];
  const caption = seasonSummaryCaption(summary);
  let posted = 0;
  for (const destination of TELEGRAM_DESTINATIONS.filter((item) => destinations.includes(item))) {
    if (await postTo(db, season, destination, () => sendPhotos(db, null, pngs, caption, fetchImpl, destination, 'image/png', undefined, { key: `club:season-summary:${season.key}:${destination}`, kind: 'club-result' }))) posted += 1;
  }
  const groupId = vkTarget();
  if (groupId && destinations.includes('vk')) {
    if (await postTo(db, season, 'vk', async () => {
      const attachments = [];
      for (const png of pngs) attachments.push(await uploadVkWallPhotoBytes(png, 'image/png', groupId, fetchImpl));
      await createVkWallPost({ groupId, message: caption, attachments });
      return { ok: true };
    })) posted += 1;
  }
  return posted;
}

/** The minute scan: a season whose last game day is over, once its evenings are closed (or after a few days anyway), posts once. */
export async function runSeasonSummaryPosts(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  const { weekday } = await loadGameSchedule(db);
  const seasons = new Map<string, ClubSeason>();
  for (const moment of [now, now - CATCH_UP_DAYS * DAY]) { const season = calendarSeasonForDate(moment); seasons.set(season.key, season); }
  let posted = 0;
  for (const season of seasons.values()) {
    const dueAt = seasonSummaryDueAt(season, weekday);
    if (now < dueAt || now > dueAt + CATCH_UP_DAYS * DAY) continue;
    if (!(await pendingDestinations(db, season)).length) continue;
    if (now < dueAt + WAIT_FOR_OPEN_EVENING_DAYS * DAY) {
      const open = await db.get<any>(`SELECT 1 FROM game_evenings WHERE ${openEveningSql()} AND datetime(starts_at) >= datetime(?) AND datetime(starts_at) < datetime(?) LIMIT 1`,
        [new Date(dueAt - 2 * DAY).toISOString(), new Date(dueAt + DAY).toISOString()]).catch(() => null);
      if (open) continue;
    }
    posted += await postSeasonSummary(db, season, fetchImpl);
  }
  return posted;
}
