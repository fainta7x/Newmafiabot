/**
 * A black player (mafia / don) who is killed on the first night goes through the best-move (ЛХ) step like any first
 * killed — otherwise the skipped step would give the role away — but the best move is worth nothing to him
 * (owner, 2026-10-10). Every score is derived from the saved best moves, so they are dropped when a protocol is saved
 * and no calculation downstream can pay a black player for one.
 */
const isBlack = (role: unknown): boolean => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  return ['mafia', 'мафия', 'маф', 'black', 'черный', 'don', 'дон'].includes(value);
};

export const blackParticipantIds = (players: Array<{ participant_id?: unknown; role?: unknown }>): Set<string> =>
  new Set(players.filter((player) => isBlack(player?.role)).map((player) => String(player?.participant_id || '')).filter(Boolean));

export const withoutBlackBestMoves = <T extends { participant_id?: unknown }>(moves: T[] | undefined | null, black: Set<string>): T[] =>
  (Array.isArray(moves) ? moves : []).filter((move) => !black.has(String(move?.participant_id || '')));

/** The legacy single-move fields of a protocol (`best_move_*`), cleared when they belong to a black player. */
export const withoutBlackLegacyBestMove = <P extends Record<string, any>>(protocol: P, black: Set<string>): P => (
  black.has(String(protocol?.best_move_participant_id || ''))
    ? { ...protocol, best_move_participant_id: null, best_move_source: null, best_move_seats: [] }
    : protocol
);
