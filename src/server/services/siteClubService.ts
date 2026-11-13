import type { DatabaseWrapper } from '../../db/index.ts';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { openEveningSql } from '../../lib/eveningStatus.ts';
import { loadEveningSummary, loadSeasonSummary } from './clubResultData.ts';
import { calendarSeasonForDate, type ClubSeason } from './clubSeasonService.ts';
import { eveningSummarySvg, renderPngAsync, seasonNominationsSvg, seasonTop10Svg } from './clubResultImages.ts';
import { loadTournamentPictures } from './clubResultPostService.ts';
import { getFlexibleTournamentStandings } from './flexibleTournamentStandingsService.ts';

/**
 * What the club's site shows to everyone (owner, 2026-11-13): the nearest games of every format with free seats,
 * a summary of past evenings and the published tournament results. Only nicknames, places and points: no roles, no contacts.
 */
const GOING = "response_status IN ('going','late')";

export async function loadSiteAgenda(db: DatabaseWrapper) {
  const rows = await db.all<any>(
    `SELECT id, title, starts_at, venue, format, capacity FROM game_evenings
      WHERE ${openEveningSql()} AND datetime(starts_at) >= datetime('now', '-3 hours')
      ORDER BY datetime(starts_at) ASC LIMIT 12`).catch(() => []);
  const items = [];
  for (const row of rows) {
    const tables = await db.get<any>('SELECT COALESCE(SUM(capacity), 0) AS seats FROM evening_tables WHERE evening_id = ?', [row.id]).catch(() => null);
    const going = await db.get<any>(`SELECT COUNT(*) AS n FROM evening_participants WHERE evening_id = ? AND ${GOING}`, [row.id]).catch(() => null);
    const seats = Number(tables?.seats || 0) || Number(row.capacity || 0);
    const format = normalizeEveningFormat(row.format);
    items.push({
      id: String(row.id), title: String(row.title || ''), starts_at: row.starts_at, venue: row.venue || null,
      format, format_label: EVENING_FORMAT_LABELS[format],
      free_seats: seats > 0 ? Math.max(0, seats - Number(going?.n || 0)) : null,
    });
  }
  return items;
}

export async function loadSiteEveningHistory(db: DatabaseWrapper, limit = 12) {
  const rows = await db.all<any>(
    `SELECT id, title, starts_at, format FROM game_evenings
      WHERE (status = 'completed' OR settled_at IS NOT NULL) AND status != 'cancelled'
      ORDER BY datetime(starts_at) DESC LIMIT ?`, [limit * 2]).catch(() => []);
  const items = [];
  for (const row of rows) {
    const summary = await loadEveningSummary(db, String(row.id)).catch(() => null);
    if (!summary || !summary.games) continue;
    const format = normalizeEveningFormat(row.format);
    items.push({
      id: String(row.id), title: String(row.title || ''), starts_at: row.starts_at, format, format_label: EVENING_FORMAT_LABELS[format],
      image: `/api/public/welcome/history/${encodeURIComponent(String(row.id))}/image.png`,
      games: summary.games, players: summary.players, red_wins: summary.redWins, black_wins: summary.blackWins,
      most_wins: summary.mostWins.slice(0, 3).map((player) => ({ nickname: String(player.nickname).slice(0, 30), value: player.value })),
    });
    if (items.length >= limit) break;
  }
  return items;
}

export async function loadSiteTournaments(db: DatabaseWrapper, limit = 10) {
  const rows = await db.all<any>(
    `SELECT id, title, date, venue FROM tournaments
      WHERE status = 'completed' AND standings_hidden_at IS NULL
      ORDER BY date DESC LIMIT ?`, [limit]).catch(() => []);
  const items = [];
  for (const row of rows) {
    const result = await getFlexibleTournamentStandings(db, String(row.id)).catch(() => null);
    const standings = (result?.standings || []).filter((entry: any) => Number(entry.games_played || 0) > 0);
    if (!standings.length) continue;
    items.push({
      id: String(row.id), title: String(row.title || ''), date: row.date, venue: row.venue || null,
      image: `/api/public/welcome/tournaments/${encodeURIComponent(String(row.id))}/image.png`,
      nominations_image: `/api/public/welcome/tournaments/${encodeURIComponent(String(row.id))}/nominations.png`,
      standings: standings.map((entry: any) => ({
        place: Number(entry.place || 0), name: String(entry.display_name || 'Участник').slice(0, 30),
        points: Number(entry.total_points || 0), wins: Number(entry.wins || 0), games: Number(entry.games_played || 0),
      })),
    });
  }
  return items;
}

const pictureCache = new Map<string, { at: number; png: Buffer }>();
async function cachedPicture(key: string, draw: () => Promise<Buffer | null>) {
  const hit = pictureCache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.png;
  const png = await draw();
  if (!png) return null;
  pictureCache.set(key, { at: Date.now(), png });
  if (pictureCache.size > 40) pictureCache.delete(String(pictureCache.keys().next().value));
  return png;
}

/** The same picture the club posts to its chats after an evening, for the site. Only for a finished, not cancelled evening. */
export async function loadSiteEveningPicture(db: DatabaseWrapper, eveningId: string) {
  const row = await db.get<any>("SELECT id FROM game_evenings WHERE id = ? AND (status = 'completed' OR settled_at IS NOT NULL) AND status != 'cancelled'", [eveningId]);
  if (!row) return null;
  return cachedPicture(`evening:${eveningId}`, async () => {
    const summary = await loadEveningSummary(db, eveningId);
    return summary && summary.games ? renderPngAsync(eveningSummarySvg(summary)) : null;
  });
}

/** The final table and the nominations of a finished tournament the organizer did not hide: always the two pictures together (owner, 2026-11-13). */
export async function loadSiteTournamentPicture(db: DatabaseWrapper, tournamentId: string, kind: 'table' | 'nominations' = 'table') {
  const row = await db.get<any>("SELECT id, title, date FROM tournaments WHERE id = ? AND status = 'completed' AND standings_hidden_at IS NULL", [tournamentId]);
  if (!row) return null;
  return cachedPicture(`tournament:${tournamentId}:${kind}`, async () => {
    const dateLabel = row.date ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(String(row.date))).replace(/\s*г\.?$/, '') : '';
    const pictures = await loadTournamentPictures(db, tournamentId, String(row.title || 'Турнир'), dateLabel, new Set<string>());
    // Both are drawn in one pass; keep the other one for the next request.
    for (const [other, png] of pictures) if (other !== kind) pictureCache.set(`tournament:${tournamentId}:${other}`, { at: Date.now(), png });
    return pictures.find(([found]) => found === kind)?.[1] || null;
  });
}

/**
 * Club seasons of the year (owner, 2026-11-13: «Осень 2026» and so on, by the calendar and automatic). A season is listed once it has completed club games.
 * The rating periods are a different thing now: the «Рейтинговая лига».
 */
async function calendarSeasonsWithGames(db: DatabaseWrapper, limit: number) {
  const months = await db.all<any>("SELECT DISTINCT substr(game_date, 1, 7) AS ym FROM games WHERE archived_at IS NULL AND game_date IS NOT NULL").catch(() => []);
  const seasons = new Map<string, ClubSeason>();
  for (const row of months) {
    const [year, month] = String(row.ym || '').split('-').map(Number);
    if (!year || !month) continue;
    const season = calendarSeasonForDate(Date.UTC(year, month - 1, 15));
    seasons.set(season.key, season);
  }
  return [...seasons.values()].sort((a, b) => b.start - a.start).slice(0, limit);
}

export async function loadSiteSeasons(db: DatabaseWrapper, limit = 6) {
  const items = [];
  for (const season of await calendarSeasonsWithGames(db, limit)) {
    const summary = await loadSeasonSummary(db, season).catch(() => null);
    if (!summary) continue;
    items.push({
      id: season.key, title: summary.title, date_label: summary.dateLabel, current: Date.now() >= season.start && Date.now() < season.end,
      games: summary.games, evenings: summary.evenings, players: summary.players,
      image: `/api/public/welcome/seasons/${encodeURIComponent(season.key)}/image.png`,
      nominations_image: `/api/public/welcome/seasons/${encodeURIComponent(season.key)}/nominations.png`,
      leader: summary.eloUp[0] ? { nickname: summary.eloUp[0].nickname, value: summary.eloUp[0].value } : null,
      mvp: summary.mvp[0] ? { nickname: summary.mvp[0].nickname, value: summary.mvp[0].value } : null,
      rows: summary.table.map((row) => ({ place: row.place, nickname: String(row.nickname).slice(0, 30), value: row.value, detail: row.detail })),
    });
  }
  return items;
}

export async function loadSiteSeasonPicture(db: DatabaseWrapper, seasonKey: string, kind: 'table' | 'nominations' = 'table') {
  const seasons = await calendarSeasonsWithGames(db, 12);
  const season = seasons.find((item) => item.key === seasonKey);
  if (!season) return null;
  return cachedPicture(`season:${seasonKey}:${kind}`, async () => {
    const summary = await loadSeasonSummary(db, season);
    if (!summary) return null;
    return renderPngAsync(kind === 'table' ? seasonTop10Svg(summary) : seasonNominationsSvg(summary));
  });
}
