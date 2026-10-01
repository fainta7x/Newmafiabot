import type { DatabaseWrapper } from '../../db/index.ts';
import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';
import { calculateBestMovePoints } from '../routes/tournamentProtocolRoutes.ts';
import { normalizeRole, roundToTwo } from '../utils/ciHelper.ts';
import { telegramBotUsername } from './playerClaimLinkService.ts';

// The bot's card after each club game (owner chose 2026-10-01): role, result, the game's points,
// the player's evening so far, and «Позвать друга» with a personal link (/start ref_<player id>).

export const INVITE_START_PREFIX = 'ref_';
const ROLE_LABELS: Record<string, string> = { citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' };
const RED_ROLES = new Set(['citizen', 'sheriff']);
const BLACK_ROLES = new Set(['mafia', 'don']);

type Button = { text: string; url?: string; web_app?: { url: string } };

const parse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};
const signed = (value: number) => `${value > 0 ? '+' : ''}${roundToTwo(value)}`;
const ruGames = (count: number) => {
  const tens = count % 100; const ones = count % 10;
  if (tens >= 11 && tens <= 14) return `${count} игр`;
  if (ones === 1) return `${count} игра`;
  if (ones >= 2 && ones <= 4) return `${count} игры`;
  return `${count} игр`;
};
const ruWins = (count: number) => {
  const tens = count % 100; const ones = count % 10;
  if (tens >= 11 && tens <= 14) return `${count} побед`;
  if (ones === 1) return `${count} победа`;
  if (ones >= 2 && ones <= 4) return `${count} победы`;
  return `${count} побед`;
};

const won = (role: string | null, winner: unknown) => Boolean(role && (
  (winner === 'red' && RED_ROLES.has(role)) || (winner === 'black' && BLACK_ROLES.has(role))
));

/** The game's points for one seat, by the same rules as the rating table (Ci is left out: it depends on the period). */
export function gameResultPoints(envelope: any, result: any) {
  const protocol = envelope?.protocol || {};
  const results: any[] = Array.isArray(envelope?.player_results) ? envelope.player_results : [];
  const participantId = String(result?.participant_id || '');
  const role = normalizeRole(result?.role);
  const seats = results.map((item) => ({ seat_number: Number(item.seat_number), role: item.role ?? null }));
  const moves = Array.isArray(protocol.best_moves) && protocol.best_moves.length
    ? protocol.best_moves
    : protocol.best_move_participant_id
      ? [{ participant_id: protocol.best_move_participant_id, seat_numbers: protocol.best_move_seats }]
      : [];
  let bestMove = 0;
  for (const move of moves) {
    if (String(move?.participant_id || '') !== participantId) continue;
    const seatNumbers = Array.isArray(move?.seat_numbers) ? move.seat_numbers.map(Number).filter(Number.isFinite) : [];
    bestMove += calculateBestMovePoints(seatNumbers, seats).bonusPoints;
  }
  const judge = Number(result?.judge_bonus || 0);
  const protocolBonus = Number(result?.protocol_bonus || 0);
  const discipline = calculateDisciplinaryPenalty(
    Math.max(0, Math.trunc(Number(result?.minor_technical_fouls || 0))),
    Math.max(0, Math.trunc(Number(result?.major_technical_fouls || 0))),
    result?.exit_type === 'removed',
    protocol.end_reason === 'ppk' && participantId === String(protocol.ppk_culprit_participant_id || ''),
  );
  const win = won(role, protocol.winner_team) ? 1 : 0;
  const extra = roundToTwo(judge + protocolBonus + bestMove - discipline);
  return { role, win, bestMove: roundToTwo(bestMove), extra, total: roundToTwo(win + extra) };
}

export async function inviteFriendUrl(playerId: string, botUsername?: string | null) {
  const bot = botUsername === undefined ? await telegramBotUsername() : botUsername;
  const start = `${INVITE_START_PREFIX}${playerId}`;
  // Telegram start parameters allow only A–Z, a–z, 0–9, «_» and «-», up to 64 characters.
  if (!bot || !/^[A-Za-z0-9_-]{1,64}$/.test(start)) return null;
  const link = `https://t.me/${bot}?start=${start}`;
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Пойдём со мной играть в мафию в 2LA Noire!')}`;
}

const appUrl = (path: string) => {
  const base = String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '').replace(/\/player$/, '');
  return base ? `${base}${path}` : null;
};

type EveningGames = { title: string | null; games: Array<{ id: number; number: number; envelope: any }> };

// One scan reads each evening once, however many seats it announces.
async function loadEvening(db: DatabaseWrapper, eveningId: string, cache?: Map<string, EveningGames>) {
  const cached = cache?.get(eveningId);
  if (cached) return cached;
  const [evening, rows] = await Promise.all([
    db.get<any>('SELECT title FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]),
    db.all<any>('SELECT id, global_game_number, protocol_text FROM games WHERE evening_id = ? AND archived_at IS NULL', [eveningId]),
  ]);
  const value: EveningGames = {
    title: evening?.title ? String(evening.title) : null,
    games: rows.map((row) => ({ id: Number(row.id), number: Number(row.global_game_number ?? 0), envelope: parse(row.protocol_text) })),
  };
  cache?.set(eveningId, value);
  return value;
}

export async function buildGameResultCard(
  db: DatabaseWrapper, game: any, envelope: any, result: any,
  botUsername?: string | null, cache?: Map<string, EveningGames>,
) {
  const playerId = String(result?.player_id || '');
  const points = gameResultPoints(envelope, result);
  const protocol = envelope?.protocol || {};
  const number = game.global_game_number || game.id;
  const evening = game.evening_id ? await loadEvening(db, String(game.evening_id), cache) : null;

  const lines = [`🎭 Игра №${number}${evening?.title ? ` · ${evening.title}` : ''}`];
  const roleLabel = points.role ? ROLE_LABELS[points.role] : null;
  lines.push(`${points.win ? '🏆 Победа' : 'Поражение'}${roleLabel ? ` · ${roleLabel}` : ''}${result?.seat_number ? ` · место ${result.seat_number}` : ''}`);
  const details: string[] = [];
  if (points.bestMove > 0) details.push(`лучший ход ${signed(points.bestMove)}`);
  if (String(protocol.first_killed_participant_id || '') === String(result?.participant_id || '')) details.push('первый убитый');
  lines.push(`Баллы за игру: ${signed(points.total)}${details.length ? ` (${details.join(', ')})` : ''}`);

  if (evening) {
    const number = Number(game.global_game_number ?? 0);
    let played = 0; let wins = 0;
    for (const other of evening.games) {
      // Only this game and the ones before it: the card tells the evening so far.
      if (other.number > number || (other.number === number && other.id > Number(game.id))) continue;
      const otherEnvelope = other.envelope;
      if (otherEnvelope?.kind !== 'club_evening_protocol' || otherEnvelope?.protocol?.status !== 'completed') continue;
      const seat = (Array.isArray(otherEnvelope.player_results) ? otherEnvelope.player_results : []).find((item: any) => String(item?.player_id || '') === playerId);
      if (!seat) continue;
      played += 1;
      if (won(normalizeRole(seat.role), otherEnvelope.protocol.winner_team)) wins += 1;
    }
    if (played > 1) lines.push(`За вечер: ${ruGames(played)} · ${ruWins(wins)}`);
  }

  const rows: Button[][] = [];
  const gamePath = `/player/games/${encodeURIComponent(String(game.id))}`;
  const gameUrl = appUrl(gamePath);
  const invite = await inviteFriendUrl(playerId, botUsername);
  const firstRow: Button[] = [];
  if (gameUrl) firstRow.push({ text: '📋 Протокол', web_app: { url: gameUrl } });
  if (invite) firstRow.push({ text: '🤝 Позвать друга', url: invite });
  if (firstRow.length) rows.push(firstRow);

  return {
    text: lines.join('\n'),
    actionPath: gamePath,
    telegramReplyMarkup: rows.length ? { inline_keyboard: rows } : null,
  };
}
