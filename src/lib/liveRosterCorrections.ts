import type { LiveGameEvent } from '../shared/liveGameEvents.ts';

/**
 * The CRM is authoritative for the current roster, not for historical actions.
 * A partial roster fetch must not be interpreted as player replacement.
 */
export type LiveRosterSeat = { seat_number: number; participant_id: string | number | null; display_name?: string | null };
export type LiveRosterIdentity = Readonly<Record<number, string>>;

export function completeLiveRosterIdentity(rows: readonly LiveRosterSeat[], tableSize = 10): LiveRosterIdentity | null {
  if (rows.length !== tableSize || !Number.isInteger(tableSize) || tableSize < 1 || tableSize > 10) return null;
  const identities: Record<number, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const seat = Number(row.seat_number);
    const identity = String(row.participant_id ?? '').trim();
    if (!Number.isInteger(seat) || seat < 1 || seat > tableSize || !identity || identity.length > 120 ||
        Object.prototype.hasOwnProperty.call(identities, seat) || seen.has(identity)) return null;
    identities[seat] = identity;
    seen.add(identity);
  }
  return identities;
}

export function liveRosterCorrectionEvents(
  previous: LiveRosterIdentity, current: LiveRosterIdentity,
  context: { nextSeq: number; at: string; round: number; phase: string },
): LiveGameEvent[] {
  const seats = Object.keys(previous).map(Number).sort((a, b) => a - b);
  // Never convert an incomplete/duplicate feed into phantom substitutions.
  if (seats.length !== Object.keys(current).length ||
      seats.some(s => !current[s] || !previous[s]) ||
      new Set(Object.values(current)).size !== seats.length) return [];
  return seats.filter(seat => previous[seat] !== current[seat]).map((seat, index) => ({
    seq: context.nextSeq + index, at: context.at, round: context.round, phase: context.phase,
    kind: 'player_reseated', seat, value: current[seat],
  }));
}

/** Replay affects only the roster projection, never earlier votes, fouls or eliminated players. */
export function replayLiveRosterIdentity(
  initial: LiveRosterIdentity, events: readonly LiveGameEvent[],
): LiveRosterIdentity {
  const current: Record<number, string> = { ...initial };
  for (const event of events) {
    if (event.kind !== 'player_reseated' || typeof event.seat !== 'number' ||
        !Object.prototype.hasOwnProperty.call(current, event.seat) ||
        typeof event.value !== 'string' || !event.value.trim() || event.value.length > 120) continue;
    current[event.seat] = event.value;
  }
  return current;
}

/** Persist the initial identity map once. Without it old corrections cannot be replayed after reload. */
export function initialLiveRosterEvents(
  roster: LiveRosterIdentity,
  context: { nextSeq: number; at: string; round: number; phase: string },
): LiveGameEvent[] {
  return Object.entries(roster).sort(([a], [b]) => Number(a) - Number(b)).map(([seat, identity], index) => ({
    ...context, seq: context.nextSeq + index, kind: 'player_assigned', seat: Number(seat), value: identity,
  }));
}

/** Rebuild the current identities only when a trustworthy initial map was journaled. */
export function restoreJournalRosterIdentity(events: readonly LiveGameEvent[]): LiveRosterIdentity | null {
  const assigned: Record<number, string> = {};
  const changes: LiveGameEvent[] = [];
  for (const event of events) {
    if (event.kind === 'player_assigned' && typeof event.seat === 'number' &&
        typeof event.value === 'string' && event.value.trim()) assigned[event.seat] = event.value;
    else if (event.kind === 'player_reseated') changes.push(event);
  }
  if (!Object.keys(assigned).length || new Set(Object.values(assigned)).size !== Object.keys(assigned).length) return null;
  return replayLiveRosterIdentity(assigned, changes);
}
