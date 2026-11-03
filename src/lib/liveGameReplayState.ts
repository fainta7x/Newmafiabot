import type { LiveGameEvent } from '../shared/liveGameEvents';

/**
 * AR04, step 1 (2026-11-03): the table state rebuilt from the live game chronology alone — the server copy of a game,
 * for when the judge's device lost its local session. Pure and read-only; the engine and its local snapshots are
 * unchanged. Timers and speech order are not in the chronology and are not rebuilt (never fabricated).
 *
 * Checked against production (AUDIT_LOG «AR04»): exits and fouls of 213 of 220 seats of the 22 games with a chronology
 * agree with the final protocol; the 7 others are games whose protocol was edited after the game.
 */
export type ReplayFouls = { foul: number; tech_minor: number; tech_major: number };
export interface ReplayGameState {
  /** Engine round: 1 is the zero circle and the first night. */
  round: number;
  phase: string | null;
  /** seat -> reason (killed, voted_day, removed, ...), only seats out of the game. */
  exits: Record<number, string>;
  fouls: Record<number, ReplayFouls>;
  /** Nominations of the current day, in order. */
  nominations: Array<{ seat: number; by: number | null }>;
  /** Ballots of the voting in progress (voter -> candidate); cleared when a voting gets its result. */
  ballots: Record<number, number>;
  /** Night of the current round. */
  shot: number | null;
  donCheck: { target: number; result: string | null } | null;
  sheriffCheck: { target: number; result: string | null } | null;
  /** All checks of the game, in order, so a resumed sheriff/don knows what was found. */
  checks: Array<{ round: number; kind: 'don' | 'sheriff'; target: number; result: string | null }>;
  firstKilled: number | null;
  bestMove: { seat: number | null; seats: number[] } | null;
  ended: boolean;
  winner: string | null;
  lastSeq: number;
}

const emptyFouls = (): ReplayFouls => ({ foul: 0, tech_minor: 0, tech_major: 0 });
const resultOf = (value: unknown) => (value === null || value === undefined ? null : String(value));

export function buildReplayGameState(events: LiveGameEvent[]): ReplayGameState {
  const state: ReplayGameState = {
    round: 1, phase: null, exits: {}, fouls: {}, nominations: [], ballots: {}, shot: null, donCheck: null, sheriffCheck: null,
    checks: [], firstKilled: null, bestMove: null, ended: false, winner: null, lastSeq: 0,
  };
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    const round = Math.max(1, Number(event.round) || 1);
    if (round !== state.round) {
      // A new circle: the day's nominations and the night's actions start empty.
      state.round = round; state.nominations = []; state.ballots = {}; state.shot = null; state.donCheck = null; state.sheriffCheck = null;
    }
    if (event.phase) state.phase = event.phase;
    state.lastSeq = event.seq;
    const seat = event.seat ?? null;
    const target = event.target ?? null;
    switch (event.kind) {
      case 'phase': if (event.value) state.phase = String(event.value); break;
      case 'exit': if (seat) state.exits[seat] = String(event.value || 'out'); break;
      case 'restored': if (seat) delete state.exits[seat]; break;
      case 'foul': case 'tech_minor': case 'tech_major':
        if (seat) {
          const fouls = state.fouls[seat] || emptyFouls();
          fouls[event.kind === 'foul' ? 'foul' : event.kind] = Math.max(0, Number(event.value) || 0);
          state.fouls[seat] = fouls;
        }
        break;
      case 'nomination':
        if (seat && !state.nominations.some((item) => item.seat === seat)) state.nominations.push({ seat, by: event.by ?? null });
        break;
      case 'nomination_removed':
        if (seat) state.nominations = state.nominations.filter((item) => item.seat !== seat);
        break;
      case 'vote': if (seat && target) state.ballots[seat] = target; break;
      case 'vote_removed': if (seat) delete state.ballots[seat]; break;
      case 'vote_round_result': state.ballots = {}; break;
      case 'shot_target': state.shot = target; break;
      case 'don_check':
      case 'sheriff_check':
        if (target) {
          const check = { target, result: resultOf(event.value) };
          if (event.kind === 'don_check') state.donCheck = check; else state.sheriffCheck = check;
          const kind = event.kind === 'don_check' ? 'don' : 'sheriff';
          state.checks = state.checks.filter((item) => !(item.round === round && item.kind === kind));
          state.checks.push({ round, kind, ...check });
        }
        break;
      case 'first_killed': state.firstKilled = seat; break;
      case 'best_move': state.bestMove = { seat, seats: String(event.value || '').split(',').map(Number).filter(Boolean) }; break;
      case 'game_end': state.ended = true; state.winner = resultOf(event.value); break;
      default: break;
    }
  }
  return state;
}

/** Seats still at the table of a table of `tableSize`. */
export const replayAliveSeats = (state: ReplayGameState, tableSize = 10): number[] =>
  Array.from({ length: tableSize }, (_, index) => index + 1).filter((seat) => !state.exits[seat]);
