import { isCompletedClubGame } from './completedClubGame.ts';
import fs from 'node:fs';
import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { resolveRepositoryPlayerAvatarPath } from '../../lib/playerAvatarManifest.ts';
import { roundToTwo } from '../utils/ciHelper.ts';
import { gameResultPoints } from './gameResultCardService.ts';
import { loadPlayerEloHistory } from './playerEloHistoryService.ts';
import { gameActionFacts } from '../../lib/gameActionFacts.ts';
import { contributionBreakdown, gameContribution } from '../../lib/playerContribution.ts';
import { SAME_LEVEL_GAP, STRONG_LEVEL_GAP } from './eloRatingService.ts';
import { ELO_PERSONAL_POINT_WEIGHT } from '../../shared/eloWeights.ts';
import { clubBestMovePointsForParticipant } from './bestMovePoints.ts';
import type { StatGame } from '../../lib/gameStatistics.ts';
import { sanitizeLiveGameEvents } from '../../shared/liveGameEvents.ts';
import { normalizeGameRole } from '../../shared/gameRoles.ts';

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
  /** Elo from the individual contribution in this game (already inside `eloDelta`) and its breakdown in plain words. */
  eloContribution: number | null;
  contributionLines: string[];
  eloPersonalBonus?: number | null;
  /** The personal bonuses by source in Elo (best move, judge, Ci), so «личные бонусы» never stays unexplained. */
  personalLines?: string[];
  eloPersonalCap?: number | null;
  eloContributionCap?: number | null;
  eloDiscipline?: number | null;
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
  /** Team strength before the game (owner, 2026-10-25): average Elo of each team, the level words and the red win chance. */
  table: BlankTable | null;
};

export type BlankTable = { redAvg: number; blackAvg: number; level: string; redChancePercent: number };

/** Personal bonuses of a seat by source, in whole Elo (owner, 2026-10-26: «непонятно, какие вклады и почему»). */
export function personalBonusLines(protocol: any, result: any, results: any[]): string[] {
  const value = (points: number) => Math.round(points * ELO_PERSONAL_POINT_WEIGHT);
  const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
  const lines: string[] = [];
  const bestMove = value(clubBestMovePointsForParticipant(protocol, String(result?.participant_id || ''), results));
  if (bestMove) lines.push(`Лучший ход: ${signed(bestMove)} Эло`);
  const judge = value(Number(result?.judge_bonus || 0) + Number(result?.protocol_bonus || 0));
  if (judge) lines.push(`Бонус судьи: ${signed(judge)} Эло`);
  const ci = value(Number(result?.ci_points || 0));
  if (ci) lines.push(`Компенсация первому убитому: ${signed(ci)} Эло`);
  return lines;
}

/** The same three steps as the Elo table level (`levelGap`): up to 150 equal, 150–250 clearly stronger, above 250 much stronger. */
export function tableLevelText(redAvg: number, blackAvg: number): string {
  const gap = Math.abs(redAvg - blackAvg);
  const stronger = redAvg > blackAvg ? 'красные' : 'чёрные';
  if (gap <= SAME_LEVEL_GAP) return 'команды одного уровня';
  return gap <= STRONG_LEVEL_GAP ? `${stronger} заметно сильнее` : `${stronger} намного сильнее`;
}

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
const isCompleted = isCompletedClubGame;
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
export async function loadAvatars(db: DatabaseWrapper, playerIds: string[]) {
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
  const byGame = new Map<string, Map<string, { delta: number; after: number; contribution: number; personal: number; cap: number; discipline: number }>>();
  const tables = new Map<string, BlankTable>();
  const timeline = await loadPlayerEloHistory(db).catch((error) => { console.error('[CLUB RESULTS] Elo unavailable:', error); return []; });
  for (const event of timeline) {
    if (event.source !== 'club') continue;
    const avg = (team: string) => { const list = event.players.filter((player) => player.team === team); return list.length ? list.reduce((sum, player) => sum + Number(player.eloBefore || 0), 0) / list.length : null; };
    const red = avg('red'); const black = avg('black'); const redPlayer = event.players.find((player) => player.team === 'red');
    if (red != null && black != null && redPlayer) tables.set(String(event.sourceId), { redAvg: Math.round(red), blackAvg: Math.round(black), level: tableLevelText(red, black), redChancePercent: Math.round(Number(redPlayer.expectedTeamResult || 0) * 100) });
    byGame.set(String(event.sourceId), new Map(event.players.map((player) => [String(player.playerId), {
      delta: Number(player.totalDelta || 0), after: Number(player.eloAfter || 0), contribution: Number(player.contributionDelta || 0),
      personal: Number(player.personalDelta || 0), cap: Number(player.personalCapDelta || 0), discipline: Number(player.disciplinaryDelta || 0),
    }])));
  }
  return Object.assign(byGame, { tables });
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
           -- The game's number within its evening: only games actually kept (deleted/archived ones never take a
           -- number), in creation order. The second evening of a day starts at №1 (owner, 2026-10-01; deleted
           -- test games stop counting, owner 2026-10-10).
           (SELECT COUNT(*) FROM games o WHERE o.evening_id = g.evening_id AND o.archived_at IS NULL AND o.id <= g.id) AS local_number
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
  const contributions = new Map(gameContribution(envelope).map((item) => [item.seat, item]));
  const scored = isScoredFormat(game.format);
  const moves = Array.isArray(protocol.best_moves) && protocol.best_moves.length
    ? protocol.best_moves
    : protocol.best_move_participant_id ? [{ participant_id: protocol.best_move_participant_id, seat_numbers: protocol.best_move_seats }] : [];

  const seats: BlankSeat[] = results.map((result) => {
    const playerId = result?.player_id ? String(result.player_id) : null;
    const participantId = String(result?.participant_id || '');
    const role = normalizeGameRole(result?.role);
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
      eloContribution: playerId && gameElo?.has(playerId) ? roundToTwo(gameElo.get(playerId)!.contribution) : null,
      eloPersonalBonus: playerId && gameElo?.has(playerId) ? gameElo.get(playerId)!.personal : null,
      personalLines: playerId && gameElo?.has(playerId) ? personalBonusLines(protocol, result, results) : [],
      eloPersonalCap: playerId && gameElo?.has(playerId) ? gameElo.get(playerId)!.cap : null,
      eloDiscipline: playerId && gameElo?.has(playerId) ? gameElo.get(playerId)!.discipline : null,
      eloContributionCap: playerId && gameElo?.has(playerId) && contributions.has(Number(result?.seat_number))
        ? gameElo.get(playerId)!.contribution - contributions.get(Number(result?.seat_number))!.points * ELO_PERSONAL_POINT_WEIGHT : null,
      contributionLines: playerId && gameElo?.has(playerId) && contributions.has(Number(result?.seat_number))
        ? contributionBreakdown(role as any, contributions.get(Number(result?.seat_number))!.items, contributions.get(Number(result?.seat_number))!.streaks)
        : [],
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
    table: elo.tables.get(String(game.id)) || null,
  };
}

type Tally = { playerId: string; games: number; wins: number; points: number; byRole: Map<string, { games: number; wins: number; points: number; effect: number }> };

const isRedRole = (role: string | null | undefined) => role === 'citizen' || role === 'sheriff';
const isBlackRole = (role: string | null | undefined) => role === 'mafia' || role === 'don';
const seatList = (value: unknown): number[] => (Array.isArray(value) ? [...new Set(value.map(Number).filter((seat) => Number.isInteger(seat) && seat > 0))] : []);

/**
 * How effective each seat was in one game (owner, 2026-10-19), by effectiveness rather than wins alone. Red: +1 per black
 * named in the best move (ЛХ), per black marked «black» in the colour protocol and per vote against a black; −1 per black
 * marked «red» and per vote against a red; the sheriff also +1 per check that found a black; +1 for a red win.
 * Black: +1 for a black win, +1 per red who marked the seat «red», +1 per best move that did not name the seat.
 * Votes of the zero circle never count (the shared action facts already leave them out).
 */
export function seatEffectiveness(envelope: any): Map<number, number> {
  const protocol = envelope?.protocol || {};
  const results: any[] = Array.isArray(envelope?.player_results) ? envelope.player_results : [];
  const seats = results
    .map((result) => ({ seat: Number(result?.seat_number), role: normalizeGameRole(result?.role), playerId: String(result?.player_id || '') || null, participantId: String(result?.participant_id || ''), colors: Array.isArray(result?.color_protocol) ? result.color_protocol : [] }))
    .filter((item) => Number.isInteger(item.seat) && item.seat > 0);
  const roleOf = new Map(seats.map((item) => [item.seat, item.role]));
  const moves: Array<{ participantId: string; seats: number[] }> = (Array.isArray(protocol.best_moves) && protocol.best_moves.length
    ? protocol.best_moves
    : protocol.best_move_participant_id ? [{ participant_id: protocol.best_move_participant_id, seat_numbers: protocol.best_move_seats }] : [])
    .map((move: any) => ({ participantId: String(move?.participant_id || ''), seats: seatList(move?.seat_numbers) }));
  const facts = gameActionFacts({
    id: '', source: 'club', date: '', winner: protocol.winner_team === 'red' || protocol.winner_team === 'black' ? protocol.winner_team : null,
    seats: seats.map(({ seat, role, playerId }) => ({ seat, role: role as any, playerId })), events: sanitizeLiveGameEvents(protocol.events),
  } satisfies StatGame);
  const markedSeats = (item: { colors: any[] }, mark: string) => new Set(item.colors.filter((entry) => entry?.mark === mark).flatMap((entry) => seatList(entry?.seat_numbers)));
  const scores = new Map<number, number>();
  for (const me of seats) {
    let score = won(me.role, protocol.winner_team) ? 1 : 0;
    if (isRedRole(me.role)) {
      for (const move of moves.filter((item) => item.participantId && item.participantId === me.participantId)) score += move.seats.filter((seat) => isBlackRole(roleOf.get(seat))).length;
      for (const seat of markedSeats(me, 'black')) if (isBlackRole(roleOf.get(seat))) score += 1;
      for (const seat of markedSeats(me, 'red')) if (isBlackRole(roleOf.get(seat))) score -= 1;
      for (const voting of facts.votings) {
        const target = voting.votes.get(me.seat);
        if (!target) continue;
        if (isBlackRole(roleOf.get(target))) score += 1; else if (isRedRole(roleOf.get(target))) score -= 1;
      }
      if (me.role === 'sheriff') score += facts.checks.filter((check) => check.kind === 'sheriff' && isBlackRole(roleOf.get(check.target))).length;
    } else if (isBlackRole(me.role)) {
      score += seats.filter((other) => isRedRole(other.role) && markedSeats(other, 'red').has(me.seat)).length;
      score += moves.filter((move) => isRedRole(seats.find((other) => other.participantId && other.participantId === move.participantId)?.role) && !move.seats.includes(me.seat)).length;
    }
    scores.set(me.seat, score);
  }
  return scores;
}

/**
 * The blank of one completed tournament game (owner, 2026-10-03): the same picture as a club game,
 * built from the tournament tables. Points are the game's total from the live standings
 * (win point, judge/protocol bonuses, best move, penalties, CI), so they match the tournament table.
 */
export async function loadTournamentGameBlank(db: DatabaseWrapper, tournamentGameId: string): Promise<GameBlank | null> {
  const game = await db.get<any>(`
    SELECT g.id, g.tournament_id, g.game_number, g.judge_name, g.judge_player_id, g.status,
           t.title, t.date, t.chief_judge_name, j.nickname AS judge_nickname
      FROM tournament_games g
      JOIN tournaments t ON t.id = g.tournament_id
 LEFT JOIN players j ON j.id = g.judge_player_id
     WHERE g.id = ? LIMIT 1
  `, [tournamentGameId]);
  if (!game || game.status !== 'completed') return null;
  const protocol = await db.get<any>("SELECT * FROM tournament_game_protocols WHERE game_id = ? AND status = 'completed' LIMIT 1", [tournamentGameId]);
  if (!protocol) return null;

  const seatsRaw = await db.all<any>(`
    SELECT tgs.participant_id, tgs.seat_number, tgs.role, tp.player_id, tp.display_name
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
     WHERE tgs.game_id = ? ORDER BY tgs.seat_number ASC
  `, [tournamentGameId]);
  const results = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [tournamentGameId]);
  const resultByParticipant = new Map<string, any>(results.map((row) => [String(row.participant_id), row]));
  const bestMoves = await db.all<any>('SELECT participant_id, seat_numbers_json FROM tournament_game_best_moves WHERE game_id = ?', [tournamentGameId]).catch(() => []);
  const ids = seatsRaw.map((seat) => String(seat.player_id || '')).filter(Boolean);
  const judgeId = game.judge_player_id ? String(game.judge_player_id) : '';
  const [names, avatars] = await Promise.all([loadNicknames(db, ids), loadAvatars(db, [...ids, judgeId])]);

  const pointsByParticipant = new Map<string, number>();
  try {
    const { getFlexibleTournamentStandings } = await import('./flexibleTournamentStandingsService.ts');
    const standings = await getFlexibleTournamentStandings(db, String(game.tournament_id));
    for (const row of standings.standings || []) {
      const entry = (row.games || []).find((item: any) => Number(item.game_number) === Number(game.game_number));
      if (entry) pointsByParticipant.set(String(row.participant_id), roundToTwo(Number(entry.game_total || 0)));
    }
  } catch (error) {
    console.error('[CLUB RESULTS] tournament game points failed:', error);
  }

  const winnerTeam = protocol.winner_team === 'red' || protocol.winner_team === 'black' ? protocol.winner_team : null;
  const seats: BlankSeat[] = seatsRaw.map((seat) => {
    const participantId = String(seat.participant_id);
    const playerId = seat.player_id ? String(seat.player_id) : null;
    const result = resultByParticipant.get(participantId);
    const role = normalizeGameRole(seat.role);
    const move = bestMoves.find((item) => String(item.participant_id) === participantId);
    let moveSeats: number[] = [];
    try { moveSeats = JSON.parse(move?.seat_numbers_json || '[]').map(Number).filter(Number.isFinite); } catch { moveSeats = []; }
    return {
      seat: Number(seat.seat_number) || 0,
      playerId,
      nickname: (playerId && names.get(playerId)) || String(seat.display_name || `Игрок ${seat.seat_number}`),
      avatar: (playerId && avatars.get(playerId)) || null,
      role,
      won: won(role, winnerTeam),
      firstKilled: participantId === String(protocol.first_killed_participant_id || ''),
      bestMoveSeats: moveSeats,
      fouls: Math.max(0, Math.trunc(Number(result?.regular_fouls || 0))),
      technicalFouls: Math.max(0, Math.trunc(Number(result?.minor_technical_fouls || 0)) + Math.trunc(Number(result?.major_technical_fouls || 0))),
      removed: result?.exit_type === 'removed',
      points: pointsByParticipant.has(participantId) ? pointsByParticipant.get(participantId)! : null,
      eloDelta: null,
      eloContribution: null,
      contributionLines: [],
      eloAfter: null,
    };
  });

  return {
    gameId: String(game.id),
    gameNumber: String(game.game_number),
    eveningTitle: String(game.title || 'Турнир'),
    dateLabel: dateLabel(game.date),
    winnerTeam,
    ppk: protocol.end_reason === 'ppk',
    judge: game.judge_nickname ? String(game.judge_nickname) : game.judge_name ? String(game.judge_name) : game.chief_judge_name ? String(game.chief_judge_name) : null,
    judgeAvatar: (judgeId && avatars.get(judgeId)) || null,
    scored: true,
    seats,
    table: null,
  };
}

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
    const effects = seatEffectiveness(envelope);
    for (const result of Array.isArray(envelope.player_results) ? envelope.player_results : []) {
      // A walk-in guest has no profile: count them by the placeholder (or the name on the seat).
      const guestKey = String(result?.guest_placeholder_id || result?.display_name || '').trim();
      const playerId = String(result?.player_id || '') || (guestKey ? `guest:${guestKey}` : '');
      if (!playerId) continue;
      if (playerId.startsWith('guest:')) guestNames.set(playerId, String(result?.display_name || 'Гость'));
      const role = normalizeGameRole(result?.role) || 'citizen';
      const win = won(role, envelope.protocol.winner_team) ? 1 : 0;
      const points = scored ? gameResultPoints(envelope, result).total : 0;
      const tally = tallies.get(playerId) || { playerId, games: 0, wins: 0, points: 0, byRole: new Map() };
      tally.games += 1; tally.wins += win; tally.points += points;
      const byRole = tally.byRole.get(role) || { games: 0, wins: 0, points: 0, effect: 0 };
      byRole.games += 1; byRole.wins += win; byRole.points += points; byRole.effect += effects.get(Number(result?.seat_number)) ?? 0;
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

  // Most wins: only players with two or more wins (owner, 2026-10-19); more wins first, then fewer games.
  const mostWins = all.filter((item) => item.wins >= 2)
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

  // Best by role = effectiveness per game of that role (owner, 2026-10-19); a role nobody played stays empty, otherwise it never is.
  const bestByRole = (['sheriff', 'don', 'mafia', 'citizen'] as const).map((role) => {
    const candidates = all.filter((item) => item.byRole.has(role));
    if (!candidates.length) return { role, player: null };
    const stat = (item: Tally) => item.byRole.get(role)!;
    const average = (item: Tally) => stat(item).effect / stat(item).games;
    const best = candidates.sort((a, b) => average(b) - average(a) || stat(b).games - stat(a).games)[0];
    return { role, player: person(best, signed(average(best)), `в среднем за ${stat(best).games} ${gamesWord(stat(best).games)}`) };
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
  /** Best by role by wins (owner, 2026-10-19: the season shows two lists). */
  bestByRole: Array<{ role: 'sheriff' | 'don' | 'mafia' | 'citizen'; player: SummaryPlayer | null }>;
  /** Best by role by effectiveness per game (the same rule as the evening summary). */
  bestByRoleEffect: Array<{ role: 'sheriff' | 'don' | 'mafia' | 'citizen'; player: SummaryPlayer | null }>;
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
  type RoleTally = { games: number; wins: number; effect: number };
  const roleTallies = new Map<string, Map<string, RoleTally>>();
  // Effectiveness needs each game's protocol (best moves, colour protocols, votes), read once per game of the season.
  const gameIds = [...new Set(qualified.flatMap((item: any) => (item.games || []).map((game: any) => Number(game.game_id))).filter(Number.isFinite))];
  const effects = new Map<number, Map<number, number>>();
  for (let from = 0; from < gameIds.length; from += 400) {
    const chunk = gameIds.slice(from, from + 400);
    const rows = await db.all<any>(`SELECT id, protocol_text FROM games WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
    for (const row of rows) effects.set(Number(row.id), seatEffectiveness(parse(row.protocol_text)));
  }
  // The best by role also counts only players who are in the season's standings.
  for (const item of qualified) {
    for (const game of item.games || []) {
      const role = normalizeGameRole(game.role) || 'citizen';
      const perRole = roleTallies.get(role) || new Map();
      const tally: RoleTally = perRole.get(String(item.player_id)) || { games: 0, wins: 0, effect: 0 };
      tally.games += 1; tally.wins += Number(game.win_point || 0);
      tally.effect += effects.get(Number(game.game_id))?.get(Number(game.seat_number)) ?? 0;
      perRole.set(String(item.player_id), tally);
      roleTallies.set(role, perRole);
    }
  }
  const roles = ['sheriff', 'don', 'mafia', 'citizen'] as const;
  const pickBest = (role: string, order: (a: RoleTally, b: RoleTally) => number, minimum: (tally: RoleTally) => boolean) => {
    const entries = [...(roleTallies.get(role) || new Map<string, RoleTally>()).entries()].sort((a, b) => order(a[1], b[1]));
    const best = entries[0];
    if (!best || !minimum(best[1])) return null;
    roleIds.add(best[0]);
    return best;
  };
  const bestByWins = roles.map((role) => ({ role, best: pickBest(role, (a, b) => b.wins - a.wins || a.games - b.games, (tally) => tally.wins > 0) }));
  const bestByEffect = roles.map((role) => ({ role, best: pickBest(role, (a, b) => b.effect / b.games - a.effect / a.games || b.games - a.games, () => true) }));

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
  const asPlayer = (best: [string, RoleTally], value: string, detail: string): SummaryPlayer => ({ playerId: best[0], nickname: names.get(best[0]) || 'Игрок', avatar: avatars.get(best[0]) || null, value, detail });
  const bestByRole = bestByWins.map(({ role, best }) => ({
    role, player: best ? asPlayer(best, `${best[1].wins} ${winsWord(best[1].wins)}`, ofGames(best[1].games)) : null,
  }));
  const bestByRoleEffect = bestByEffect.map(({ role, best }) => ({
    role, player: best ? asPlayer(best, signed(best[1].effect / best[1].games), `в среднем за ${best[1].games} ${gamesWord(best[1].games)}`) : null,
  }));
  const pending = pendingRows.map((item: any) => ({ nickname: names.get(String(item.player_id)) || String(item.nickname || 'Игрок'), games: Number(item.games_played) }));
  return { periodTitle: String(period.title || 'Сезон'), scored, games: Number(result.completed_games_count || 0), rows, minGames, pending, bestByRole, bestByRoleEffect };
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
  // Numbered like the CRM: the evening's kept games in creation order; archived (deleted) games take no number.
  const rows = (await db.all<any>(
    'SELECT id, global_game_number, protocol_text, archived_at FROM games WHERE evening_id = ? ORDER BY id',
    [eveningId],
  ));
  const elo = await loadClubElo(db);
  const players = new Map<string, EveningPlayerResult>();
  let keptNumber = 0;
  for (const row of rows) {
    if (row.archived_at) continue;
    keptNumber += 1;
    const envelope = parse(row.protocol_text);
    if (!isCompleted(envelope)) continue;
    const gameElo = elo.get(String(row.id));
    for (const result of Array.isArray(envelope.player_results) ? envelope.player_results : []) {
      const playerId = String(result?.player_id || '');
      if (!playerId) continue;
      const role = normalizeGameRole(result?.role);
      const win = won(role, envelope.protocol.winner_team);
      const entry = players.get(playerId) || { playerId, games: [], wins: 0, points: scored ? 0 : null, eloDelta: null, eloAfter: null };
      entry.games.push({ number: String(keptNumber), role, won: win });
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

export type TournamentAnnouncement = {
  tournamentId: string;
  title: string;
  startsAt: string;
  dateLabel: string;
  timeLabel: string;
  venue: string | null;
  judge: string | null;
  players: Array<{ playerId: string; nickname: string; avatar: string | null }>;
};

/** Everything the tournament announcement shows: the confirmed roster with photos, the judge, the start. */
export async function loadTournamentAnnouncement(db: DatabaseWrapper, tournamentId: string): Promise<TournamentAnnouncement | null> {
  const tournament = await db.get<any>('SELECT id, title, date, venue, chief_judge_name FROM tournaments WHERE id = ? LIMIT 1', [tournamentId]);
  if (!tournament) return null;
  let rows = await db.all<any>(
    `SELECT r.player_id, p.nickname FROM tournament_registrations r JOIN players p ON p.id = r.player_id
      WHERE r.tournament_id = ? AND r.status = 'confirmed' ORDER BY COALESCE(r.slot_number, 99), r.registered_at`,
    [tournamentId],
  ).catch(() => []);
  if (!rows.length) {
    rows = await db.all<any>(
      `SELECT tp.player_id, COALESCE(NULLIF(tp.display_name, ''), p.nickname) AS nickname FROM tournament_participants tp JOIN players p ON p.id = tp.player_id
        WHERE tp.tournament_id = ? ORDER BY tp.participant_number`,
      [tournamentId],
    ).catch(() => []);
  }
  const avatars = await loadAvatars(db, rows.map((row: any) => String(row.player_id)));
  const time = new Date(String(tournament.date)).getTime();
  return {
    tournamentId,
    title: String(tournament.title || 'Турнир'),
    startsAt: String(tournament.date),
    dateLabel: dateLabel(tournament.date) || '',
    timeLabel: Number.isFinite(time) ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(time) : '',
    venue: tournament.venue ? String(tournament.venue) : null,
    judge: tournament.chief_judge_name ? String(tournament.chief_judge_name) : null,
    players: rows.map((row: any) => ({ playerId: String(row.player_id), nickname: String(row.nickname || 'Игрок'), avatar: avatars.get(String(row.player_id)) || null })),
  };
}

