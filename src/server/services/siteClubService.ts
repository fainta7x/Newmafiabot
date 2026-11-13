import type { DatabaseWrapper } from '../../db/index.ts';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { openEveningSql } from '../../lib/eveningStatus.ts';
import { loadEveningSummary, loadSeasonTableForPeriod } from './clubResultData.ts';
import { eveningSummarySvg, renderPngAsync, seasonTableSvg } from './clubResultImages.ts';
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

/** Rating seasons (periods) with games: the table the club posts each week, for the site's «Сезоны» page. A draft period is not shown. */
export async function loadSiteSeasons(db: DatabaseWrapper, limit = 6) {
  const periods = await db.all<any>(
    `SELECT * FROM rating_periods WHERE status IN ('active', 'completed', 'archived')
      ORDER BY datetime(starts_at) DESC LIMIT ?`, [limit]).catch(() => []);
  const items = [];
  for (const period of periods) {
    const table = await loadSeasonTableForPeriod(db, period).catch(() => null);
    if (!table || !table.rows.length) continue;
    items.push({
      id: String(period.id), title: String(period.title || table.periodTitle), starts_at: period.starts_at, ends_at: period.ends_at,
      status: String(period.status), games: table.games,
      image: `/api/public/welcome/seasons/${encodeURIComponent(String(period.id))}/image.png`,
      rows: table.rows.map((row) => ({ place: row.place, nickname: String(row.nickname).slice(0, 30), value: row.value, detail: row.detail })),
    });
  }
  return items;
}

export async function loadSiteSeasonPicture(db: DatabaseWrapper, periodId: string) {
  const period = await db.get<any>("SELECT * FROM rating_periods WHERE id = ? AND status IN ('active', 'completed', 'archived')", [periodId]);
  if (!period) return null;
  return cachedPicture(`season:${periodId}`, async () => {
    const table = await loadSeasonTableForPeriod(db, period);
    return table ? renderPngAsync(seasonTableSvg(table)) : null;
  });
}
