import type { DatabaseWrapper } from '../../db/index.ts';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { openEveningSql } from '../../lib/eveningStatus.ts';
import { loadEveningSummary } from './clubResultData.ts';
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
      WHERE status = 'completed' AND results_published_at IS NOT NULL AND standings_hidden_at IS NULL
      ORDER BY date DESC LIMIT ?`, [limit]).catch(() => []);
  const items = [];
  for (const row of rows) {
    const result = await getFlexibleTournamentStandings(db, String(row.id)).catch(() => null);
    const standings = (result?.standings || []).filter((entry: any) => Number(entry.games_played || 0) > 0);
    if (!standings.length) continue;
    items.push({
      id: String(row.id), title: String(row.title || ''), date: row.date, venue: row.venue || null,
      standings: standings.map((entry: any) => ({
        place: Number(entry.place || 0), name: String(entry.display_name || 'Участник').slice(0, 30),
        points: Number(entry.total_points || 0), wins: Number(entry.wins || 0), games: Number(entry.games_played || 0),
      })),
    });
  }
  return items;
}
