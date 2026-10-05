import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { loadCompletedGameSnapshots } from './clubGameAnalyticsService.ts';

/**
 * Club evening awards (owner, 2026-10-04, two titles since 2026-10-05): «MVP вечера» goes to the player the participants
 * voted best of the evening (one question, `best_player`); «Игрок вечера» goes to the player with the most game wins of
 * the evening. Titles are counted per calendar year (Moscow time) and the counter starts from zero every January; every
 * title is also a trophy in the showcase. When a year is over, the three players with the most MVP titles get «Игрок
 * года» awards in their profile showcase; past years stay there.
 */
// Three days after the evening is closed: a Friday evening is voted on until Monday, before the next one is announced.
export const EVENING_VOTING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const VOTE_CATEGORY = 'best_player';
const AWARD_KEY_PREFIX = 'club-year:';
const TROPHY_PREFIX = 'club-evening-';

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

/** «MVP вечера» (by vote) titles of one player per calendar year, newest year first. */
export async function loadPlayerEveningTitles(db: DatabaseWrapper, playerId: string, now = Date.now()) {
  const counts = new Map<number, number>();
  for (const title of await loadEveningTitles(db, now)) {
    if (title.player_id === playerId) counts.set(title.year, (counts.get(title.year) || 0) + 1);
  }
  return [...counts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year);
}

/**
 * How many evenings of «benefit of the doubt» a player gets in the yearly rating (owner, 2026-10-05: a minimum of
 * evenings «or a coefficient people already invented»). It is the weighted rating used by IMDb-style charts: until a
 * player has about this many evenings, his title rate is pulled toward the club average, so two evenings with two titles do
 * not beat a regular with ten evenings and seven titles.
 */
export const YEAR_RATING_PRIOR_EVENINGS = 5;

/**
 * The podium of a year: players with at least one title, ranked by the weighted rating
 * `(titles + m × clubRate) / (evenings + m)` (`clubRate` = all titles of the year over all attendances, `m` = 5), then by
 * more titles, then by more evenings; equal ratings share a place; at most three places. Without attendance data the rank is
 * simply by titles.
 */
export function buildYearPodium(titles: Array<{ year: number; player_id: string }>, year: number, attendance?: Map<string, number>) {
  const counts = new Map<string, number>();
  for (const title of titles) if (title.year === year) counts.set(title.player_id, (counts.get(title.player_id) || 0) + 1);
  const totalTitles = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const totalAttendances = attendance ? [...attendance.values()].reduce((sum, value) => sum + value, 0) : 0;
  const clubRate = totalAttendances > 0 ? totalTitles / totalAttendances : 0;
  const rows = [...counts.entries()].map(([playerId, count]) => {
    const evenings = attendance ? Math.max(attendance.get(playerId) || 0, count) : count;
    const rating = attendance ? (count + YEAR_RATING_PRIOR_EVENINGS * clubRate) / (evenings + YEAR_RATING_PRIOR_EVENINGS) : count;
    return { player_id: playerId, titles: count, evenings, rating };
  }).sort((a, b) => b.rating - a.rating || b.titles - a.titles || b.evenings - a.evenings || a.player_id.localeCompare(b.player_id));
  const podium: Array<{ player_id: string; place: number; titles: number; evenings: number; rating: number }> = [];
  let place = 0;
  let previous: { rating: number; titles: number; evenings: number } | null = null;
  for (const row of rows) {
    const same = previous && Math.abs(previous.rating - row.rating) < 1e-9 && previous.titles === row.titles && previous.evenings === row.evenings;
    if (!same) place = podium.length + 1;
    previous = row;
    if (place > 3) break;
    podium.push({ ...row, place });
  }
  return podium;
}

/** Evenings attended per player per calendar year (completed evenings; the base of the yearly rating). */
export async function loadYearAttendance(db: DatabaseWrapper): Promise<Map<number, Map<string, number>>> {
  const rows = await db.all<any>(
    `SELECT ep.player_id, e.starts_at, e.settled_at
       FROM evening_participants ep JOIN game_evenings e ON e.id = ep.evening_id
      WHERE ep.attendance_status = 'attended' AND ep.player_id IS NOT NULL AND (e.status = 'completed' OR e.settled_at IS NOT NULL)`,
  ).catch(() => []);
  const byYear = new Map<number, Map<string, number>>();
  for (const row of rows) {
    const year = moscowYear(row.starts_at || row.settled_at);
    if (!year) continue;
    const players = byYear.get(year) || new Map<string, number>();
    players.set(String(row.player_id), (players.get(String(row.player_id)) || 0) + 1);
    byYear.set(year, players);
  }
  return byYear;
}

/**
 * Keeps the player's yearly awards in line with the closed years (owner, 2026-10-05: two yearly titles): «Игрок года» for
 * the evening titles «Игрок вечера» (by wins) and «MVP года» for «MVP вечера» (by vote), each with its own podium of three,
 * ranked by the weighted rating. Adds the ones earned, removes the ones that no longer hold (a recounted vote or game).
 * The current year has no award yet, only the counters.
 */
export async function syncClubYearAwards(db: DatabaseWrapper, playerId: string, now = Date.now()) {
  const [mvpTitles, winTitles, attendance] = await Promise.all([loadEveningTitles(db, now), loadEveningWinTitles(db), loadYearAttendance(db)]);
  const currentYear = moscowYear(new Date(now).toISOString()) || new Date(now).getUTCFullYear();
  const families = [
    { prefix: `${AWARD_KEY_PREFIX}wins:`, name: 'Игрок года', source: 'Игрок вечера', titles: winTitles },
    { prefix: `${AWARD_KEY_PREFIX}mvp:`, name: 'MVP года', source: 'MVP вечера', titles: mvpTitles },
  ];
  const wanted = new Map<string, { year: number; place: number; count: number; evenings: number; name: string; source: string }>();
  for (const family of families) {
    const years = [...new Set(family.titles.map((title) => title.year))].filter((year) => year < currentYear);
    for (const year of years) {
      const mine = buildYearPodium(family.titles, year, attendance.get(year) || new Map()).find((row) => row.player_id === playerId);
      if (mine) wanted.set(`${family.prefix}${year}:${mine.place}:${playerId}`, { year, place: mine.place, count: mine.titles, evenings: mine.evenings, name: family.name, source: family.source });
    }
  }
  const stamp = new Date(now).toISOString();
  for (const [sourceKey, award] of wanted) {
    await db.run(
      `INSERT OR IGNORE INTO player_verified_awards (
         id, player_id, kind, title, tournament_name, award_date, award_year, place_result, description,
         source, source_type, source_key, verification_status, created_by, verified_by, verified_at, created_at, updated_at
       ) VALUES (?, ?, 'placement', ?, 'Клуб 2LA Noire', ?, ?, ?, ?, ?, 'automatic', ?, 'verified', 'system:club-year', 'system:club-year', ?, ?, ?)`,
      [`award_${crypto.randomUUID()}`, playerId, `${award.name} ${award.year}`, `${award.year}-12-31`, award.year, `${award.place} место`,
        `Званий «${award.source}»: ${award.count} за ${award.evenings} вечеров`, `Club year ${award.year}`, sourceKey, stamp, stamp, stamp],
    );
  }
  // Every yearly award, including the single-family ones of the first release (`club-year:`), is reconciled.
  const persisted = await db.all<any>(
    "SELECT id, source_key FROM player_verified_awards WHERE player_id = ? AND source_type = 'automatic' AND source_key LIKE ?",
    [playerId, `${AWARD_KEY_PREFIX}%`],
  );
  for (const row of persisted) {
    if (!wanted.has(String(row.source_key))) await db.run('DELETE FROM player_verified_awards WHERE id = ?', [row.id]);
  }
}

export type EveningWinTitle = { evening_id: string; year: number; player_id: string; wins: number; games: number };

/**
 * «Игрок вечера» of one evening (owner, 2026-10-05): the player with the most game wins; on a tie the higher win rate
 * (wins per game played), then more games played, as «Игрок вечера · по результатам» in the stories; players still equal share the title. Nobody wins without at least one won game.
 */
export const pickEveningWinners = (games: Array<{ players: Array<{ player_id: string; won: boolean }> }>) => {
  const totals = new Map<string, { wins: number; games: number }>();
  for (const game of games) {
    for (const player of game.players) {
      const current = totals.get(player.player_id) || { wins: 0, games: 0 };
      current.games += 1;
      if (player.won) current.wins += 1;
      totals.set(player.player_id, current);
    }
  }
  const rows = [...totals.entries()].map(([player_id, total]) => ({ player_id, ...total })).filter((row) => row.wins >= 1);
  if (!rows.length) return [];
  const bestWins = Math.max(...rows.map((row) => row.wins));
  const top = rows.filter((row) => row.wins === bestWins);
  const bestRate = Math.max(...top.map((row) => row.wins / row.games));
  const byRate = top.filter((row) => row.wins / row.games === bestRate);
  const mostGames = Math.max(...byRate.map((row) => row.games));
  return byRate.filter((row) => row.games === mostGames);
};

/** «Игрок вечера» of every completed club evening, from the games played that evening. */
export async function loadEveningWinTitles(db: DatabaseWrapper): Promise<EveningWinTitle[]> {
  const evenings = await db.all<any>("SELECT id, starts_at, settled_at FROM game_evenings WHERE status = 'completed' OR settled_at IS NOT NULL");
  if (!evenings.length) return [];
  const known = new Map(evenings.map((row) => [String(row.id), row]));
  const gamesByEvening = new Map<string, Array<{ players: Array<{ player_id: string; won: boolean }> }>>();
  for (const snapshot of await loadCompletedGameSnapshots(db)) {
    if (snapshot.source !== 'club' || !known.has(String(snapshot.event_id))) continue;
    const bucket = gamesByEvening.get(String(snapshot.event_id)) || [];
    bucket.push({ players: snapshot.players.filter((player) => player.player_id).map((player) => ({ player_id: String(player.player_id), won: Boolean(player.won) })) });
    gamesByEvening.set(String(snapshot.event_id), bucket);
  }
  const titles: EveningWinTitle[] = [];
  for (const [eveningId, games] of gamesByEvening) {
    const row = known.get(eveningId)!;
    const year = moscowYear(row.starts_at || row.settled_at);
    if (!year) continue;
    for (const winner of pickEveningWinners(games)) titles.push({ evening_id: eveningId, year, player_id: winner.player_id, wins: winner.wins, games: winner.games });
  }
  return titles;
}

const countsByYear = (titles: Array<{ year: number; player_id: string }>, playerId: string) => {
  const counts = new Map<number, number>();
  for (const title of titles) if (title.player_id === playerId) counts.set(title.year, (counts.get(title.year) || 0) + 1);
  return [...counts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year);
};

/** «Игрок вечера» (by wins) titles of one player per calendar year, newest year first. */
export async function loadPlayerEveningWinTitles(db: DatabaseWrapper, playerId: string) {
  return countsByYear(await loadEveningWinTitles(db), playerId);
}

/**
 * Every title is also a trophy in the showcase (owner, 2026-10-05): «Игрок вечера» (by wins) and «MVP вечера» (by vote),
 * one automatic award per evening. Kept in line with the data: earned ones added, ones that no longer hold removed.
 */
export async function syncClubEveningTrophies(db: DatabaseWrapper, playerId: string, now = Date.now()) {
  const [mvpTitles, winTitles] = await Promise.all([loadEveningTitles(db, now), loadEveningWinTitles(db)]);
  const wanted = new Map<string, { title: string; eveningId: string; note: string }>();
  for (const title of mvpTitles) if (title.player_id === playerId) wanted.set(`${TROPHY_PREFIX}mvp:${title.evening_id}:${playerId}`, { title: 'MVP вечера', eveningId: title.evening_id, note: `Голосов зрителей: ${title.votes}` });
  for (const title of winTitles) if (title.player_id === playerId) wanted.set(`${TROPHY_PREFIX}wins:${title.evening_id}:${playerId}`, { title: 'Игрок вечера', eveningId: title.evening_id, note: `Побед в играх вечера: ${title.wins} из ${title.games}` });
  const stamp = new Date(now).toISOString();
  for (const [sourceKey, trophy] of wanted) {
    const evening = await db.get<any>('SELECT title, starts_at, settled_at FROM game_evenings WHERE id = ? LIMIT 1', [trophy.eveningId]);
    const date = String(evening?.starts_at || evening?.settled_at || stamp).slice(0, 10);
    await db.run(
      `INSERT OR IGNORE INTO player_verified_awards (
         id, player_id, kind, title, tournament_name, award_date, award_year, place_result, description,
         source, source_type, source_key, verification_status, created_by, verified_by, verified_at, created_at, updated_at
       ) VALUES (?, ?, 'trophy', ?, ?, ?, ?, NULL, ?, ?, 'automatic', ?, 'verified', 'system:club-evening', 'system:club-evening', ?, ?, ?)`,
      [`award_${crypto.randomUUID()}`, playerId, trophy.title, String(evening?.title || 'Вечер клуба'), date, Number(date.slice(0, 4)) || null, trophy.note, 'Club evening', sourceKey, stamp, stamp, stamp],
    );
  }
  const persisted = await db.all<any>(
    "SELECT id, source_key FROM player_verified_awards WHERE player_id = ? AND source_type = 'automatic' AND source_key LIKE ?",
    [playerId, `${TROPHY_PREFIX}%`],
  );
  for (const row of persisted) {
    if (!wanted.has(String(row.source_key))) await db.run('DELETE FROM player_verified_awards WHERE id = ?', [row.id]);
  }
}
