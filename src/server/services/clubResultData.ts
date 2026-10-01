import fs from 'node:fs';
import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { resolveRepositoryPlayerAvatarPath } from '../../lib/playerAvatarManifest.ts';
import { normalizeRole, roundToTwo } from '../utils/ciHelper.ts';
import { gameResultPoints } from './gameResultCardService.ts';
import { loadPlayerEloHistory } from './playerEloHistoryService.ts';

// Data for the pictures the bot posts to the club chat (owner, 2026-10-01): the blank after each
// game and the evening summary at closeout. Points exist only on rating and tournament evenings.

export type BlankSeat = {
  seat: number;
  playerId: string | null;
  nickname: string;
  avatar: string | null;
  role: string | null;
  won: boolean;
  firstKilled: boolean;
  bestMoveSeats: number[];
  fouls: number;
  technicalFouls: number;
  removed: boolean;
  points: number | null;
  eloDelta: number | null;
  eloAfter: number | null;
};

export type GameBlank = {
  gameId: string;
  gameNumber: string;
  eveningTitle: string;
  dateLabel: string | null;
  winnerTeam: 'red' | 'black' | null;
  ppk: boolean;
  judge: string | null;
  judgeAvatar: string | null;
  scored: boolean;
  seats: BlankSeat[];
};

export type SummaryPlayer = { playerId: string; nickname: string; avatar: string | null; value: string; detail: string };

export type EveningSummary = {
  eveningTitle: string;
  dateLabel: string | null;
  scored: boolean;
  games: number;
  redWins: number;
  blackWins: number;
  players: number;
  mostWins: SummaryPlayer[];
  bestAverage: SummaryPlayer[];
  eloGain: SummaryPlayer[];
  bestByRole: Array<{ role: 'sheriff' | 'don' | 'mafia' | 'citizen'; player: SummaryPlayer | null }>;
};

const parse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};
const isCompleted = (envelope: any) => envelope?.kind === 'club_evening_protocol' && envelope?.protocol?.status === 'completed';
export const isScoredFormat = (format: unknown) => ['RATING', 'TOURNAMENT'].includes(normalizeEveningFormat(format));
const won = (role: string | null, winner: unknown) => Boolean(role && (
  (winner === 'red' && (role === 'citizen' || role === 'sheriff')) || (winner === 'black' && (role === 'mafia' || role === 'don'))
));
export const dateLabel = (value: unknown) => {
  const time = new Date(String(value || '')).getTime();
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' }).format(time);
};
const comma = (value: number) => String(roundToTwo(value)).replace('.', ',');
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${comma(Math.abs(value))}`;

/** The player's photo as a data URL for the picture: an uploaded avatar, else the club's stored photo. */
async function loadAvatars(db: DatabaseWrapper, playerIds: string[]) {
  const result = new Map<string, string>();
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return result;
  const rows = await db.all<any>(
    `SELECT player_id, mime_type, image_data FROM player_avatars WHERE player_id IN (${ids.map(() => '?').join(',')})`,
    ids,
  ).catch(() => []);
  for (const row of rows) {
    if (row.image_data == null) continue;
    const bytes = Buffer.isBuffer(row.image_data) ? row.image_data
      : row.image_data instanceof Uint8Array ? Buffer.from(row.image_data)
        : Buffer.from(String(row.image_data), 'base64');
    if (bytes.length) result.set(String(row.player_id), `data:${String(row.mime_type || 'image/jpeg')};base64,${bytes.toString('base64')}`);
  }
  for (const id of ids) {
    if (result.has(id)) continue;
    const suppressed = await db.get('SELECT 1 FROM player_avatar_repository_suppression WHERE player_id = ? LIMIT 1', [id]).catch(() => null);
    const file = suppressed ? null : resolveRepositoryPlayerAvatarPath(id);
    if (file) result.set(id, `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`);
  }
  return result;
}

/** Elo changes per club game id (novice evenings do not move Elo). */
async function loadClubElo(db: DatabaseWrapper) {
  const byGame = new Map<string, Map<string, { delta: number; after: number }>>();
  const timeline = await loadPlayerEloHistory(db).catch((error) => { console.error('[CLUB RESULTS] Elo unavailable:', error); return []; });
  for (const event of timeline) {
    if (event.source !== 'club') continue;
    byGame.set(String(event.sourceId), new Map(event.players.map((player) => [String(player.playerId), { delta: Number(player.totalDelta || 0), after: Number(player.eloAfter || 0) }])));
  }
  return byGame;
}

async function loadNicknames(db: DatabaseWrapper, playerIds: string[]) {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return new Map<string, string>();
  const rows = await db.all<any>(`SELECT id, nickname FROM players WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  return new Map(rows.map((row) => [String(row.id), String(row.nickname || 'Игрок')]));
}

export async function loadGameBlank(db: DatabaseWrapper, gameId: string): Promise<GameBlank | null> {
  const game = await db.get<any>(`
    SELECT g.id, g.global_game_number, g.game_date, g.judge_name, g.judge_player_id, g.protocol_text,
           e.title, e.format, e.starts_at, j.nickname AS judge_nickname,
           -- The game's number within its evening (owner, 2026-10-01: the second evening of a day starts at №1).
           (SELECT COUNT(*) FROM games o WHERE o.evening_id = g.evening_id AND o.archived_at IS NULL
              AND (o.global_game_number < g.global_game_number OR (o.global_game_number = g.global_game_number AND o.id <= g.id))) AS local_number
      FROM games g
      JOIN game_evenings e ON e.id = g.evening_id
 LEFT JOIN players j ON j.id = g.judge_player_id
     WHERE g.id = ? AND g.archived_at IS NULL LIMIT 1
  `, [gameId]);
  const envelope = parse(game?.protocol_text);
  if (!game || !isCompleted(envelope)) return null;
  const protocol = envelope.protocol || {};
  const results: any[] = Array.isArray(envelope.player_results) ? envelope.player_results : [];
  const ids = results.map((item) => String(item?.player_id || '')).filter(Boolean);
  const judgeId = game.judge_player_id ? String(game.judge_player_id) : '';
  const [names, avatars, elo] = await Promise.all([loadNicknames(db, ids), loadAvatars(db, [...ids, judgeId]), loadClubElo(db)]);
  const gameElo = elo.get(String(game.id));
  const scored = isScoredFormat(game.format);
  const moves = Array.isArray(protocol.best_moves) && protocol.best_moves.length
    ? protocol.best_moves
    : protocol.best_move_participant_id ? [{ participant_id: protocol.best_move_participant_id, seat_numbers: protocol.best_move_seats }] : [];

  const seats: BlankSeat[] = results.map((result) => {
    const playerId = result?.player_id ? String(result.player_id) : null;
    const participantId = String(result?.participant_id || '');
    const role = normalizeRole(result?.role);
    const move = moves.find((item: any) => String(item?.participant_id || '') === participantId);
    return {
      seat: Number(result?.seat_number) || 0,
      playerId,
      nickname: (playerId && names.get(playerId)) || String(result?.display_name || `Игрок ${result?.seat_number}`),
      avatar: (playerId && avatars.get(playerId)) || null,
      role,
      won: won(role, protocol.winner_team),
      firstKilled: participantId !== '' && participantId === String(protocol.first_killed_participant_id || ''),
      bestMoveSeats: Array.isArray(move?.seat_numbers) ? move.seat_numbers.map(Number).filter(Number.isFinite) : [],
      fouls: Math.max(0, Math.trunc(Number(result?.regular_fouls || 0))),
      technicalFouls: Math.max(0, Math.trunc(Number(result?.minor_technical_fouls || 0)) + Math.trunc(Number(result?.major_technical_fouls || 0))),
      removed: result?.exit_type === 'removed',
      points: scored ? gameResultPoints(envelope, result).total : null,
      eloDelta: playerId && gameElo?.has(playerId) ? Math.round(gameElo.get(playerId)!.delta) : null,
      eloAfter: playerId && gameElo?.has(playerId) ? Math.round(gameElo.get(playerId)!.after) : null,
    };
  }).sort((a, b) => a.seat - b.seat);

  return {
    gameId: String(game.id),
    gameNumber: String(game.local_number || game.global_game_number || game.id),
    eveningTitle: String(game.title || 'Игровой вечер'),
    dateLabel: dateLabel(game.starts_at || game.game_date),
    winnerTeam: protocol.winner_team === 'red' || protocol.winner_team === 'black' ? protocol.winner_team : null,
    ppk: protocol.end_reason === 'ppk',
    judge: game.judge_nickname ? String(game.judge_nickname) : game.judge_name ? String(game.judge_name) : null,
    judgeAvatar: (judgeId && avatars.get(judgeId)) || null,
    scored,
    seats,
  };
}

type Tally = { playerId: string; games: number; wins: number; points: number; byRole: Map<string, { games: number; wins: number; points: number }> };

export async function loadEveningSummary(db: DatabaseWrapper, eveningId: string): Promise<EveningSummary | null> {
  const evening = await db.get<any>('SELECT id, title, format, starts_at FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) return null;
  const rows = await db.all<any>('SELECT id, protocol_text FROM games WHERE evening_id = ? AND archived_at IS NULL', [eveningId]);
  const elo = await loadClubElo(db);
  const eloByPlayer = new Map<string, number>();
  const guestNames = new Map<string, string>();
  const scored = isScoredFormat(evening.format);
  const tallies = new Map<string, Tally>();
  let games = 0; let redWins = 0; let blackWins = 0;
  for (const row of rows) {
    const envelope = parse(row.protocol_text);
    if (!isCompleted(envelope)) continue;
    games += 1;
    if (envelope.protocol.winner_team === 'red') redWins += 1;
    if (envelope.protocol.winner_team === 'black') blackWins += 1;
    for (const [playerId, change] of elo.get(String(row.id)) || []) eloByPlayer.set(playerId, (eloByPlayer.get(playerId) || 0) + change.delta);
    for (const result of Array.isArray(envelope.player_results) ? envelope.player_results : []) {
      // A walk-in guest has no profile: count them by the placeholder (or the name on the seat).
      const guestKey = String(result?.guest_placeholder_id || result?.display_name || '').trim();
      const playerId = String(result?.player_id || '') || (guestKey ? `guest:${guestKey}` : '');
      if (!playerId) continue;
      if (playerId.startsWith('guest:')) guestNames.set(playerId, String(result?.display_name || 'Гость'));
      const role = normalizeRole(result?.role) || 'citizen';
      const win = won(role, envelope.protocol.winner_team) ? 1 : 0;
      const points = scored ? gameResultPoints(envelope, result).total : 0;
      const tally = tallies.get(playerId) || { playerId, games: 0, wins: 0, points: 0, byRole: new Map() };
      tally.games += 1; tally.wins += win; tally.points += points;
      const byRole = tally.byRole.get(role) || { games: 0, wins: 0, points: 0 };
      byRole.games += 1; byRole.wins += win; byRole.points += points;
      tally.byRole.set(role, byRole);
      tallies.set(playerId, tally);
    }
  }
  if (!games) return null;
  const all = [...tallies.values()];
  const ids = all.map((item) => item.playerId).filter((id) => !id.startsWith('guest:'));
  const [names, avatars] = await Promise.all([loadNicknames(db, ids), loadAvatars(db, ids)]);
  const person = (tally: Tally, value: string, detail: string): SummaryPlayer => ({
    playerId: tally.playerId, nickname: names.get(tally.playerId) || guestNames.get(tally.playerId) || 'Игрок', avatar: avatars.get(tally.playerId) || null, value, detail,
  });
  const winsWord = (count: number) => (count % 10 === 1 && count % 100 !== 11 ? 'победа' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'победы' : 'побед');
  const ofGames = (count: number) => `из ${count} ${count % 10 === 1 && count % 100 !== 11 ? 'игры' : 'игр'}`;
  const gamesWord = (count: number) => (count % 10 === 1 && count % 100 !== 11 ? 'игру' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'игры' : 'игр');

  // Most wins: more wins first, then fewer games.
  const mostWins = all.filter((item) => item.wins > 0)
    .sort((a, b) => b.wins - a.wins || a.games - b.games)
    .slice(0, 3)
    .map((item) => person(item, `${item.wins} ${winsWord(item.wins)}`, ofGames(item.games)));

  // Rating evenings: the best is the average per game, not the sum (owner, 2026-10-01).
  const bestAverage = scored
    ? all.sort((a, b) => b.points / b.games - a.points / a.games || b.games - a.games).slice(0, 3)
      .map((item) => person(item, signed(item.points / item.games), `в среднем за ${item.games} ${gamesWord(item.games)}`))
    : [];

  const eloGain = [...eloByPlayer.entries()]
    .filter(([, delta]) => Math.round(delta) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([playerId, delta]) => person(tallies.get(playerId) || { playerId, games: 0, wins: 0, points: 0, byRole: new Map() }, `+${Math.round(delta)}`, 'Эло за вечер'));

  const bestByRole = (['sheriff', 'don', 'mafia', 'citizen'] as const).map((role) => {
    const candidates = all.filter((item) => item.byRole.has(role));
    if (!candidates.length) return { role, player: null };
    const stat = (item: Tally) => item.byRole.get(role)!;
    const best = scored
      ? candidates.sort((a, b) => stat(b).points / stat(b).games - stat(a).points / stat(a).games || stat(b).games - stat(a).games)[0]
      : candidates.sort((a, b) => stat(b).wins - stat(a).wins || stat(b).wins / stat(b).games - stat(a).wins / stat(a).games || stat(b).games - stat(a).games)[0];
    const s = stat(best);
    if (!scored && s.wins === 0) return { role, player: null };
    return {
      role,
      player: scored
        ? person(best, signed(s.points / s.games), `в среднем за ${s.games} ${gamesWord(s.games)}`)
        : person(best, `${s.wins} ${winsWord(s.wins)}`, ofGames(s.games)),
    };
  });

  return {
    eveningTitle: String(evening.title || 'Игровой вечер'),
    dateLabel: dateLabel(evening.starts_at),
    scored, games, redWins, blackWins, players: all.length, mostWins, bestAverage, eloGain, bestByRole,
  };
}

export type SeasonRow = { place: number; playerId: string; nickname: string; avatar: string | null; value: string; detail: string };
export type SeasonTable = {
  periodTitle: string;
  scored: boolean;
  games: number;
  rows: SeasonRow[];
  minGames: number | null;
  pending: Array<{ nickname: string; games: number }>;
  bestByRole: Array<{ role: 'sheriff' | 'don' | 'mafia' | 'citizen'; player: SummaryPlayer | null }>;
};

/** Rating seasons: the top counts only players with at least 40% of the most active player's games (owner, 2026-10-01). */
export const SEASON_MIN_SHARE = 0.4;

/** The rating period that counts this evening: its own format, its dates, or an organizer override. */
async function findSeasonPeriod(db: DatabaseWrapper, evening: any) {
  const override = await db.get<any>(`
    SELECT p.* FROM rating_period_evening_overrides o JOIN rating_periods p ON p.id = o.period_id
     WHERE o.evening_id = ? AND o.included = 1 ORDER BY p.starts_at DESC LIMIT 1
  `, [evening.id]).catch(() => null);
  if (override) return override;
  return db.get<any>(`
    SELECT p.* FROM rating_periods p
     WHERE UPPER(p.type) = ? AND p.auto_include = 1
       AND datetime(p.starts_at) <= datetime(?) AND datetime(p.ends_at) >= datetime(?)
       AND NOT EXISTS (SELECT 1 FROM rating_period_evening_overrides o WHERE o.period_id = p.id AND o.evening_id = ? AND o.included = 0)
     ORDER BY p.starts_at DESC LIMIT 1
  `, [normalizeEveningFormat(evening.format), evening.starts_at, evening.starts_at, evening.id]).catch(() => null);
}

/** The season so far (owner, 2026-10-01): top 10 of the evening's rating period and the best by role. */
export async function loadSeasonTable(db: DatabaseWrapper, eveningId: string): Promise<SeasonTable | null> {
  const evening = await db.get<any>('SELECT id, format, starts_at FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) return null;
  const period = await findSeasonPeriod(db, evening);
  if (!period) return null;
  return loadSeasonTableForPeriod(db, period);
}

/** The table of one rating period (also used for the weekly post in the entry channel). */
export async function loadSeasonTableForPeriod(db: DatabaseWrapper, period: any): Promise<SeasonTable | null> {
  const { calculateRatingPeriodStandings } = await import('./ratingPeriodStandingsService.ts');
  const result = await calculateRatingPeriodStandings(db, String(period.id));
  const standings = (result.standings || []).filter((item: any) => Number(item.games_played) > 0);
  if (!standings.length) return null;
  // The period decides the season's rules (an organizer may include an evening of another format).
  const scored = isScoredFormat(period.type);
  const average = (item: any) => Number(item.total_points || 0) / Number(item.games_played);
  const maxGames = Math.max(...standings.map((item: any) => Number(item.games_played)));
  const minGames = scored ? Math.max(1, Math.ceil(maxGames * SEASON_MIN_SHARE)) : null;
  const qualified = minGames ? standings.filter((item: any) => Number(item.games_played) >= minGames) : standings;
  const pendingRows = minGames
    ? standings.filter((item: any) => Number(item.games_played) < minGames)
      .sort((a: any, b: any) => b.games_played - a.games_played || a.nickname.localeCompare(b.nickname, 'ru'))
    : [];
  const ranked = [...qualified].sort((a: any, b: any) => (scored
    ? average(b) - average(a) || b.games_played - a.games_played
    : b.wins - a.wins || a.games_played - b.games_played || a.nickname.localeCompare(b.nickname, 'ru'))).slice(0, 10);

  const winsWord = (count: number) => (count % 10 === 1 && count % 100 !== 11 ? 'победа' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'победы' : 'побед');
  const ofGames = (count: number) => `из ${count} ${count % 10 === 1 && count % 100 !== 11 ? 'игры' : 'игр'}`;
  const gamesWord = (count: number) => (count % 10 === 1 && count % 100 !== 11 ? 'игру' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'игры' : 'игр');

  const roleIds = new Set<string>(ranked.map((item: any) => String(item.player_id)));
  const roleTallies = new Map<string, Map<string, { games: number; wins: number; points: number }>>();
  // The best by role also counts only players who are in the season's standings.
  for (const item of qualified) {
    for (const game of item.games || []) {
      const role = normalizeRole(game.role) || 'citizen';
      const perRole = roleTallies.get(role) || new Map();
      const tally = perRole.get(String(item.player_id)) || { games: 0, wins: 0, points: 0 };
      tally.games += 1; tally.wins += Number(game.win_point || 0); tally.points += Number(game.game_total || 0);
      perRole.set(String(item.player_id), tally);
      roleTallies.set(role, perRole);
    }
  }
  const bestRole = (['sheriff', 'don', 'mafia', 'citizen'] as const).map((role) => {
    const entries = [...(roleTallies.get(role) || new Map()).entries()];
    if (!entries.length) return { role, best: null as null | [string, { games: number; wins: number; points: number }] };
    entries.sort((a, b) => (scored
      ? b[1].points / b[1].games - a[1].points / a[1].games || b[1].games - a[1].games
      : b[1].wins - a[1].wins || a[1].games - b[1].games));
    const best = entries[0];
    if (!scored && best[1].wins === 0) return { role, best: null };
    roleIds.add(best[0]);
    return { role, best };
  });

  const ids = [...roleIds];
  const [names, avatars] = await Promise.all([loadNicknames(db, [...ids, ...pendingRows.map((item: any) => String(item.player_id))]), loadAvatars(db, ids)]);
  const rows: SeasonRow[] = ranked.map((item: any, index: number) => ({
    place: index + 1,
    playerId: String(item.player_id),
    nickname: names.get(String(item.player_id)) || String(item.nickname || 'Игрок'),
    avatar: avatars.get(String(item.player_id)) || null,
    value: scored ? signed(average(item)) : `${item.wins} ${winsWord(item.wins)}`,
    detail: scored ? `в среднем · ${item.games_played} ${gamesWord(item.games_played)}` : ofGames(item.games_played),
  }));
  const bestByRole = bestRole.map(({ role, best }) => ({
    role,
    player: best ? {
      playerId: best[0],
      nickname: names.get(best[0]) || 'Игрок',
      avatar: avatars.get(best[0]) || null,
      value: scored ? signed(best[1].points / best[1].games) : `${best[1].wins} ${winsWord(best[1].wins)}`,
      detail: scored ? `в среднем за ${best[1].games} ${gamesWord(best[1].games)}` : ofGames(best[1].games),
    } : null,
  }));
  const pending = pendingRows.map((item: any) => ({ nickname: names.get(String(item.player_id)) || String(item.nickname || 'Игрок'), games: Number(item.games_played) }));
  return { periodTitle: String(period.title || 'Сезон'), scored, games: Number(result.completed_games_count || 0), rows, minGames, pending, bestByRole };
}

export type EveningPlayerResult = {
  playerId: string;
  games: Array<{ number: string; role: string | null; won: boolean }>;
  wins: number;
  points: number | null;
  eloDelta: number | null;
  eloAfter: number | null;
};

/** Each profile's evening for the one personal message after closing (owner, 2026-10-01). */
export async function loadEveningPlayerResults(db: DatabaseWrapper, eveningId: string) {
  const evening = await db.get<any>('SELECT id, title, format, starts_at FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) return null;
  const scored = isScoredFormat(evening.format);
  const rows = await db.all<any>(
    'SELECT id, global_game_number, protocol_text FROM games WHERE evening_id = ? AND archived_at IS NULL ORDER BY global_game_number, id',
    [eveningId],
  );
  const elo = await loadClubElo(db);
  const players = new Map<string, EveningPlayerResult>();
  for (const [index, row] of rows.entries()) {
    const envelope = parse(row.protocol_text);
    if (!isCompleted(envelope)) continue;
    const gameElo = elo.get(String(row.id));
    for (const result of Array.isArray(envelope.player_results) ? envelope.player_results : []) {
      const playerId = String(result?.player_id || '');
      if (!playerId) continue;
      const role = normalizeRole(result?.role);
      const win = won(role, envelope.protocol.winner_team);
      const entry = players.get(playerId) || { playerId, games: [], wins: 0, points: scored ? 0 : null, eloDelta: null, eloAfter: null };
      entry.games.push({ number: String(index + 1), role, won: win });
      if (win) entry.wins += 1;
      if (scored) entry.points = (entry.points || 0) + gameResultPoints(envelope, result).total;
      const change = gameElo?.get(playerId);
      if (change) {
        entry.eloDelta = (entry.eloDelta || 0) + change.delta;
        entry.eloAfter = change.after;
      }
      players.set(playerId, entry);
    }
  }
  return { title: String(evening.title || 'Игровой вечер'), dateLabel: dateLabel(evening.starts_at), scored, players: [...players.values()] };
}
