import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * Club evening awards (owner, 2026-10-04): the title «Игрок вечера» goes to the player the participants voted best of
 * the evening (one question, `best_player`). Titles are counted per calendar year (Moscow time) and the counter starts
 * from zero every January. When a year is over, the three players with the most titles get «Игрок года» awards in their
 * profile showcase; past years stay there.
 */
export const EVENING_VOTING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const VOTE_CATEGORY = 'best_player';
const AWARD_KEY_PREFIX = 'club-year:';

export const moscowYear = (value: unknown): number | null => {
  const time = new Date(String(value || '')).getTime();
  if (!Number.isFinite(time)) return null;
  return Number(new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'Europe/Moscow' }).format(time));
};

export type EveningTitle = { evening_id: string; year: number; player_id: string; votes: number };

/** Winners of every evening whose voting is closed: the nominee(s) with the most votes (a tie shares the title). */
export async function loadEveningTitles(db: DatabaseWrapper, now = Date.now()): Promise<EveningTitle[]> {
  const table = await db.get<any>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'evening_player_votes' LIMIT 1");
  if (!table) return [];
  const rows = await db.all<any>(`
    SELECT v.evening_id, v.nominee_player_id, COUNT(*) AS votes, e.starts_at, e.settled_at
      FROM evening_player_votes v
      JOIN game_evenings e ON e.id = v.evening_id
     WHERE v.category = ? AND (e.status = 'completed' OR e.settled_at IS NOT NULL)
     GROUP BY v.evening_id, v.nominee_player_id
  `, [VOTE_CATEGORY]);
  const byEvening = new Map<string, any[]>();
  for (const row of rows) {
    const base = new Date(String(row.settled_at || row.starts_at || '')).getTime();
    // Still open: the result can change, so it is not a title yet.
    if (!Number.isFinite(base) || base + EVENING_VOTING_WINDOW_MS > now) continue;
    byEvening.set(String(row.evening_id), [...(byEvening.get(String(row.evening_id)) || []), row]);
  }
  const titles: EveningTitle[] = [];
  for (const [eveningId, candidates] of byEvening) {
    const best = Math.max(...candidates.map((row) => Number(row.votes || 0)));
    const year = moscowYear(candidates[0].starts_at || candidates[0].settled_at);
    if (!year || best < 1) continue;
    for (const row of candidates) {
      if (Number(row.votes || 0) === best) titles.push({ evening_id: eveningId, year, player_id: String(row.nominee_player_id), votes: best });
    }
  }
  return titles;
}

/** Titles of one player per calendar year, newest year first. */
export async function loadPlayerEveningTitles(db: DatabaseWrapper, playerId: string, now = Date.now()) {
  const counts = new Map<number, number>();
  for (const title of await loadEveningTitles(db, now)) {
    if (title.player_id === playerId) counts.set(title.year, (counts.get(title.year) || 0) + 1);
  }
  return [...counts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year);
}

/** The podium of a year: titles descending, equal counts share a place; at most three places. */
export function buildYearPodium(titles: EveningTitle[], year: number) {
  const counts = new Map<string, number>();
  for (const title of titles) if (title.year === year) counts.set(title.player_id, (counts.get(title.player_id) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const podium: Array<{ player_id: string; place: number; titles: number }> = [];
  let place = 0;
  let previous = -1;
  for (const [playerId, count] of ranked) {
    if (count !== previous) { place = podium.length + 1; previous = count; }
    if (place > 3) break;
    podium.push({ player_id: playerId, place, titles: count });
  }
  return podium;
}

/**
 * Keeps the player's «Игрок года» awards in line with the closed years: adds the ones earned, removes the ones that no
 * longer hold (a recounted vote). The current year has no award yet, only the counter.
 */
export async function syncClubYearAwards(db: DatabaseWrapper, playerId: string, now = Date.now()) {
  const titles = await loadEveningTitles(db, now);
  const currentYear = moscowYear(new Date(now).toISOString()) || new Date(now).getUTCFullYear();
  const years = [...new Set(titles.map((title) => title.year))].filter((year) => year < currentYear);
  const wanted = new Map<string, { year: number; place: number; count: number }>();
  for (const year of years) {
    const mine = buildYearPodium(titles, year).find((row) => row.player_id === playerId);
    if (mine) wanted.set(`${AWARD_KEY_PREFIX}${year}:${mine.place}:${playerId}`, { year, place: mine.place, count: mine.titles });
  }
  const stamp = new Date(now).toISOString();
  for (const [sourceKey, award] of wanted) {
    await db.run(
      `INSERT OR IGNORE INTO player_verified_awards (
         id, player_id, kind, title, tournament_name, award_date, award_year, place_result, description,
         source, source_type, source_key, verification_status, created_by, verified_by, verified_at, created_at, updated_at
       ) VALUES (?, ?, 'placement', ?, 'Клуб 2LA Noire', ?, ?, ?, ?, ?, 'automatic', ?, 'verified', 'system:club-year', 'system:club-year', ?, ?, ?)`,
      [`award_${crypto.randomUUID()}`, playerId, `Игрок года ${award.year}`, `${award.year}-12-31`, award.year, `${award.place} место`,
        `Звание «Игрок вечера»: ${award.count}`, `Club year ${award.year}`, sourceKey, stamp, stamp, stamp],
    );
  }
  const persisted = await db.all<any>(
    "SELECT id, source_key FROM player_verified_awards WHERE player_id = ? AND source_type = 'automatic' AND source_key LIKE ?",
    [playerId, `${AWARD_KEY_PREFIX}%`],
  );
  for (const row of persisted) {
    if (!wanted.has(String(row.source_key))) await db.run('DELETE FROM player_verified_awards WHERE id = ?', [row.id]);
  }
}
