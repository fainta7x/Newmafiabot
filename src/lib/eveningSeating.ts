/**
 * Evening seating planner. A planned game is not an actual game: positions only
 * enter the played history when a game starts. Keep table-specific cycles apart.
 */
export type EveningSeat = {
  game: number;
  tableId: string;
  seat: number;
  playerId: string;
  locked?: boolean;
  started?: boolean;
};
export type EveningSeatCandidate = {
  game: number;
  tableId: string;
  seat: number;
};
export type EveningPlayer = {
  id: string;
  eligibleGames: number[];
};
export type EveningSeatingWarning = {
  code: 'repeat_seat' | 'occupied' | 'same_game' | 'not_registered';
  text: string;
};

const gameTableKey = (game: number, tableId: string, seat: number) => JSON.stringify([game, tableId, seat]);

/**
 * A full cycle resets independently per player/table, not globally or per game.
 * Reservations and upcoming assignments participate in planning, but only
 * started games are immutable historical observations.
 */
export function usedSeatsInCurrentCycle(
  playerId: string,
  tableId: string,
  assignments: EveningSeat[],
  capacity = 10,
): Set<number> {
  const played = assignments.filter((entry) =>
    entry.playerId === playerId && entry.tableId === tableId && entry.started,
  ).sort((a, b) => a.game - b.game);
  const used = new Set<number>();
  for (const entry of played) {
    if (used.size >= capacity) used.clear();
    used.add(entry.seat);
  }
  return used.size >= capacity ? new Set() : used;
}

/** Non-organizers must not override seat conflicts; organizers see warnings. */
export function seatingWarnings(
  candidate: EveningSeat,
  assignments: EveningSeat[],
  eligibleGames: number[],
  capacity = 10,
): EveningSeatingWarning[] {
  const others = assignments.filter((entry) => !(entry.playerId === candidate.playerId
    && entry.game === candidate.game && entry.tableId === candidate.tableId && entry.seat === candidate.seat));
  const warnings: EveningSeatingWarning[] = [];
  if (!eligibleGames.includes(candidate.game)) warnings.push({ code: 'not_registered', text: 'Игрок не записан на эту игру' });
  if (others.some((entry) => entry.game === candidate.game && entry.tableId === candidate.tableId && entry.seat === candidate.seat))
    warnings.push({ code: 'occupied', text: 'Место уже занято' });
  if (others.some((entry) => entry.game === candidate.game && entry.playerId === candidate.playerId))
    warnings.push({ code: 'same_game', text: 'Игрок уже назначен на эту игру' });

  // Re-evaluate the full table timeline when inserting or moving an
  // assignment. Earlier bookings must not invalidate later booked seats.
  const timeline = [...others.filter(entry => entry.playerId === candidate.playerId && entry.tableId === candidate.tableId), candidate]
    .sort((a, b) => a.game - b.game || Number(Boolean(b.started)) - Number(Boolean(a.started)));
  const seen = new Set<number>();
  for (const entry of timeline) {
    if (seen.size >= capacity) seen.clear();
    if (seen.has(entry.seat) && (entry === candidate || entry.game >= candidate.game)) {
      warnings.push({ code: 'repeat_seat', text: `Этот игрок сегодня уже сидел на месте №${entry.seat} за этим столом. Рекомендуем выбрать другое место.` });
      break;
    }
    seen.add(entry.seat);
  }
  return warnings;
}

/** Seats a player already took at a table before `game` in the current cycle (planned and started games alike). */
const usedBefore = (playerId: string, tableId: string, game: number, assignments: EveningSeat[], capacity: number): Set<number> => {
  const used = new Set<number>();
  for (const entry of assignments.filter((item) => item.playerId === playerId && item.tableId === tableId && item.game < game).sort((a, b) => a.game - b.game)) {
    if (used.size >= capacity) used.clear();
    used.add(entry.seat);
  }
  return used.size >= capacity ? new Set() : used;
};

const shuffle = <T,>(items: T[], random: () => number): T[] => {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** A random perfect matching player → seat over allowed pairs (Kuhn's algorithm on shuffled orders); unmatched players are returned too. */
const matchSeats = (players: string[], seats: EveningSeatCandidate[], allowed: (player: string, seat: EveningSeatCandidate) => boolean, random: () => number) => {
  const seatOrder = shuffle(seats, random);
  const owner = new Map<number, string>();
  const tryPlace = (player: string, seen: Set<number>): boolean => {
    for (let index = 0; index < seatOrder.length; index += 1) {
      if (seen.has(index) || !allowed(player, seatOrder[index])) continue;
      seen.add(index);
      const current = owner.get(index);
      if (current === undefined || tryPlace(current, seen)) { owner.set(index, player); return true; }
    }
    return false;
  };
  const unmatched = shuffle(players, random).filter((player) => !tryPlace(player, new Set()));
  return { placed: [...owner].map(([index, player]) => ({ ...seatOrder[index], playerId: player })), unmatched, free: seatOrder.filter((_, index) => !owner.has(index)) };
};

/**
 * Random plan (owner, 2026-11-03: «нужна полная случайная рассадка с теми условиями, которые уже согласованы»), game by
 * game and table by table: reservations stay; the players of a game are those with the fewest games so far (random among
 * equals); seats are a random assignment in which nobody repeats a seat of the current cycle at that table. When no
 * assignment without a repeat exists, the seat is still filled (fewest repeats) — a free seat is never left while an
 * eligible player is free. `random` is injectable for tests.
 */
function planOnce(
  slots: EveningSeatCandidate[],
  players: EveningPlayer[],
  existing: EveningSeat[],
  capacity: number,
  random: () => number,
): { planned: EveningSeat[]; repeats: number } {
  let repeats = 0;
  const planned = [...existing];
  const taken = (slot: EveningSeatCandidate) => planned.some((entry) => gameTableKey(entry.game, entry.tableId, entry.seat) === gameTableKey(slot.game, slot.tableId, slot.seat));
  const counts = new Map(players.map((player) => [player.id, existing.filter((seat) => seat.playerId === player.id).length]));
  const games = [...new Set(slots.map((slot) => slot.game))].sort((a, b) => a - b);
  for (const game of games) {
    const free = slots.filter((slot) => slot.game === game && !taken(slot));
    if (!free.length) continue;
    const pool = shuffle(players.filter((player) => player.eligibleGames.includes(game) && !planned.some((entry) => entry.game === game && entry.playerId === player.id)), random)
      .sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0));
    const chosen = pool.slice(0, free.length).map((player) => player.id);
    const noRepeat = (player: string, seat: EveningSeatCandidate) => !usedBefore(player, seat.tableId, game, planned, capacity).has(seat.seat);
    const first = matchSeats(chosen, free, noRepeat, random);
    const result = [...first.placed];
    if (first.unmatched.length) {
      // No assignment without a repeat: fill the rest anyway, a random free seat each.
      const rest = matchSeats(first.unmatched, first.free, () => true, random);
      repeats += rest.placed.length;
      result.push(...rest.placed);
    }
    for (const seat of result) {
      planned.push(seat);
      counts.set(seat.playerId, (counts.get(seat.playerId) || 0) + 1);
    }
  }
  return { planned, repeats };
}

/** Up to `attempts` random plans; the first without a repeated seat wins, otherwise the one with the fewest repeats. */
export function planEveningSeats(
  slots: EveningSeatCandidate[],
  players: EveningPlayer[],
  existing: EveningSeat[],
  capacity = 10,
  random: () => number = Math.random,
  attempts = 40,
): EveningSeat[] {
  let best: { planned: EveningSeat[]; repeats: number } | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const plan = planOnce(slots, players, existing, capacity, random);
    if (!best || plan.repeats < best.repeats) best = plan;
    if (plan.repeats === 0) break;
  }
  return best ? best.planned : [...existing];
}
