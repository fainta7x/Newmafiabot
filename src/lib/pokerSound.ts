/** Pure transition detector: the table is polled many times per second.
 * Emit an event only on a real state transition; never replay history at mount or on reconnect.
 */
export type PokerSoundCue = 'deal' | 'board' | 'chips' | 'chipsBig' | 'check' | 'fold' | 'sweep' | 'turn' | 'timer' | 'win';
export interface PokerSoundState {
  tableId: string | null;
  handId: string | null;
  street: string;
  boardCount: number;
  pot: number;
  logCount: number;
  lastActionType: string;
  viewerTurn: boolean;
  secondsRemaining: number | null;
}

const CHIP_ACTIONS = new Set(['small_blind', 'big_blind', 'call']);
/** A bigger stack of chips goes in: a longer, heavier sound. */
const BIG_CHIP_ACTIONS = new Set(['bet', 'raise', 'all_in']);

export const pokerSoundState = (tableId: unknown, hand: any): PokerSoundState => {
  const seconds = Number(hand?.turn_remaining?.base_seconds || 0) > 0
    ? Number(hand.turn_remaining.base_seconds)
    : Number(hand?.turn_remaining?.reserve_seconds || 0);
  const log = Array.isArray(hand?.action_log) ? hand.action_log : [];
  return {
    tableId: tableId ? String(tableId) : null,
    handId: hand?.id ? String(hand.id) : null,
    street: String(hand?.street || ''),
    boardCount: Array.isArray(hand?.board) ? hand.board.length : 0,
    pot: Number(hand?.pot || 0),
    logCount: log.length,
    lastActionType: String(log.at(-1)?.type || ''),
    viewerTurn: Boolean(hand?.is_viewer_turn && hand?.street !== 'finished'),
    secondsRemaining: hand?.turn_remaining ? Math.max(0, seconds) : null,
  };
};

export const pokerSoundCues = (before: PokerSoundState | null, after: PokerSoundState): PokerSoundCue[] => {
  if (!before || !after.handId || before.tableId !== after.tableId) return [];
  // First hand after waiting: the owner has already enabled audio in the same mounted table.
  if (!before.handId || before.handId !== after.handId) return ['deal'];
  const cues: PokerSoundCue[] = [];
  // The bets of a finished betting round are swept into the pot while the next street is dealt.
  if (before.street !== after.street && after.street !== 'finished' && before.pot > 0) cues.push('sweep');
  if (after.boardCount > before.boardCount) cues.push('board');
  if (after.logCount > before.logCount) {
    if (CHIP_ACTIONS.has(after.lastActionType)) cues.push('chips');
    else if (BIG_CHIP_ACTIONS.has(after.lastActionType)) cues.push('chipsBig');
    else if (after.lastActionType === 'check') cues.push('check');
    else if (after.lastActionType === 'fold') cues.push('fold');
  }
  if (!before.viewerTurn && after.viewerTurn) cues.push('turn');
  if (after.viewerTurn && before.viewerTurn && before.secondsRemaining !== null &&
      after.secondsRemaining !== null && before.secondsRemaining > 5 &&
      after.secondsRemaining <= 5 && after.secondsRemaining > 0) cues.push('timer');
  if (before.street !== 'finished' && after.street === 'finished') cues.push('win');
  return cues;
};
