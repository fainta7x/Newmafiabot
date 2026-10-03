/**
 * Chronology of a live game (owner request, 2026-10-03): every step the judge takes in the Live Game engine is
 * written down as a small event, so a finished game can be analysed afterwards and statistics collected from it.
 * The log is additive: it travels next to the protocol and never replaces the protocol fields.
 */

export type LiveGameEventKind =
  | 'game_start'
  | 'phase'
  | 'night_step'
  | 'voting_stage'
  | 'nomination'
  | 'nomination_removed'
  | 'speech_start'
  | 'vote'
  | 'vote_removed'
  | 'table_vote'
  | 'table_vote_removed'
  | 'vote_round_result'
  | 'shot_target'
  | 'don_check'
  | 'sheriff_check'
  | 'foul'
  | 'tech_minor'
  | 'tech_major'
  | 'exit'
  | 'restored'
  | 'first_killed'
  | 'zero_round_voted'
  | 'best_move'
  | 'ppk'
  | 'death_protocol'
  | 'game_end';

export interface LiveGameEvent {
  /** Order of the event inside the game, starting from 1. */
  seq: number;
  /** ISO time the engine noticed the change. */
  at: string;
  /** Engine round: 1 is the zero circle (and the first night), then 2, 3, ... */
  round: number;
  phase: string;
  kind: LiveGameEventKind | string;
  /** The seat the event is about (voter, speaker, victim, checked player, ...). */
  seat?: number | null;
  /** The seat the event points at (vote target, shot target, ...). */
  target?: number | null;
  /** The seat that caused it (who nominated). */
  by?: number | null;
  /** Short extra detail: a status, a result, a list of seats. */
  value?: string | number | boolean | null;
}

export const MAX_LIVE_GAME_EVENTS = 4000;

const isSeat = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 10;

const cleanSeat = (value: unknown): number | null => (isSeat(value) ? value : null);

const cleanText = (value: unknown, max: number): string => String(value ?? '').slice(0, max);

/**
 * Keeps only well-formed events with bounded fields. Used on the server before anything is stored and on the client
 * before a stored copy is trusted.
 */
export const sanitizeLiveGameEvents = (value: unknown): LiveGameEvent[] => {
  if (!Array.isArray(value)) return [];
  const result: LiveGameEvent[] = [];
  for (const raw of value) {
    if (result.length >= MAX_LIVE_GAME_EVENTS) break;
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const kind = cleanText(item.kind, 32).replace(/[^a-z_]/g, '');
    if (!kind) continue;
    const event: LiveGameEvent = {
      seq: result.length + 1,
      at: cleanText(item.at, 40),
      round: Number.isInteger(item.round) && (item.round as number) >= 0 && (item.round as number) <= 99 ? (item.round as number) : 0,
      phase: cleanText(item.phase, 32).replace(/[^a-z_]/g, ''),
      kind,
    };
    const seat = cleanSeat(item.seat);
    const target = cleanSeat(item.target);
    const by = cleanSeat(item.by);
    if (seat !== null) event.seat = seat;
    if (target !== null) event.target = target;
    if (by !== null) event.by = by;
    if (typeof item.value === 'number' && Number.isFinite(item.value)) event.value = item.value;
    else if (typeof item.value === 'boolean') event.value = item.value;
    else if (typeof item.value === 'string') event.value = item.value.slice(0, 120);
    result.push(event);
  }
  return result;
};
