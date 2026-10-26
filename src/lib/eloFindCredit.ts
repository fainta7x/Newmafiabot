import { normalizeGameRole } from '../shared/gameRoles.ts';

/** One red player can earn at most 0.2 points (8 Elo) of base credit for each black. */
export const FOUND_BLACK_MAX_POINTS = 0.2;
export interface FindCreditCandidate<T> {
  item: T; target: number; value: number; seq: number | null; ownDecision: boolean;
}

/** LH keeps its sporting scale; the same targets in later automatic awards only earn the remaining credit. */
export function bestMoveBlackCredits(protocol: any, participantId: string, results: any[]): Map<number, number> {
  const credits = new Map<number, number>();
  if (!participantId) return credits;
  const modern = Array.isArray(protocol?.best_moves) ? protocol.best_moves : [];
  const relevant = modern.filter((move: any) => String(move?.participant_id || '') === participantId);
  const moves = relevant.length ? relevant : String(protocol?.best_move_participant_id || '') === participantId
    ? [{ seat_numbers: protocol?.best_move_seats }] : [];
  const blacks = new Set(results.filter((row) => ['mafia', 'don'].includes(normalizeGameRole(row?.role) || '')).map((row) => Number(row.seat_number)));
  for (const move of moves) {
    const targets = [...new Set<number>((Array.isArray(move?.seat_numbers) ? move.seat_numbers : []).map(Number))].filter((seat) => blacks.has(seat));
    const points = targets.length === 1 ? 0.1 : targets.length === 2 ? 0.3 : targets.length >= 3 ? 0.6 : 0;
    for (const target of targets) credits.set(target, Math.min(FOUND_BLACK_MAX_POINTS, (credits.get(target) || 0) + points / targets.length));
  }
  return credits;
}

/** Source order cannot increase the final base price; only a first independent find may extend a positive series. */
export function allocateFindCredit<T>(candidates: FindCreditCandidate<T>[], initial = new Map<number, number>()) {
  const paid = new Map(initial);
  const seen = new Set(initial.keys());
  const awards = new Map<T, number>();
  const newDecisions = new Set<T>();
  for (const candidate of [...candidates].sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity))) {
    const previous = paid.get(candidate.target) || 0;
    const desired = Math.min(FOUND_BLACK_MAX_POINTS, Math.max(0, candidate.value));
    const award = Math.max(0, desired - previous);
    awards.set(candidate.item, award);
    paid.set(candidate.target, Math.max(previous, desired));
    if (award > 1e-10 && candidate.ownDecision && !seen.has(candidate.target)) newDecisions.add(candidate.item);
    if (award > 1e-10) seen.add(candidate.target);
  }
  return { awards, newDecisions };
}
