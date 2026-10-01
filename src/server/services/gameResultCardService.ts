import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';
import { calculateBestMovePoints } from '../routes/tournamentProtocolRoutes.ts';
import { normalizeRole, roundToTwo } from '../utils/ciHelper.ts';
import { telegramBotUsername } from './playerClaimLinkService.ts';

// Shared pieces of the bot's result messages: a seat's game points and the «Позвать друга» link
// (/start ref_<player id>). The personal message itself is one per evening (clubResultPostService).

export const INVITE_START_PREFIX = 'ref_';
const RED_ROLES = new Set(['citizen', 'sheriff']);
const BLACK_ROLES = new Set(['mafia', 'don']);


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

export const appUrl = (path: string) => {
  const base = String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '').replace(/\/player$/, '');
  return base ? `${base}${path}` : null;
};
