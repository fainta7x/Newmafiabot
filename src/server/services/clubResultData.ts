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
           e.title, e.format, e.starts_at, j.nickname AS judge_nickname
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
    gameNumber: String(game.global_game_number || game.id),
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
      const playerId = String(result?.player_id || '');
      if (!playerId) continue;
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
  const ids = all.map((item) => item.playerId);
  const [names, avatars] = await Promise.all([loadNicknames(db, ids), loadAvatars(db, ids)]);
  const person = (tally: Tally, value: string, detail: string): SummaryPlayer => ({
    playerId: tally.playerId, nickname: names.get(tally.playerId) || 'Игрок', avatar: avatars.get(tally.playerId) || null, value, detail,
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
