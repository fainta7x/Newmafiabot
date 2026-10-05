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
        `Званий «MVP вечера»: ${award.count}`, `Club year ${award.year}`, sourceKey, stamp, stamp, stamp],
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
