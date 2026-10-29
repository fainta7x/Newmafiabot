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

  const history = usedSeatsInCurrentCycle(candidate.playerId, candidate.tableId, assignments, capacity);
  const future = assignments.filter((entry) => !entry.started && entry.playerId === candidate.playerId
    && entry.tableId === candidate.tableId && entry.game < candidate.game
    && !(entry.game === candidate.game && entry.seat === candidate.seat)).sort((a, b) => a.game - b.game);
  for (const entry of future) {
    if (history.size >= capacity) history.clear();
    history.add(entry.seat);
  }
  if (history.size >= capacity) history.clear();
  if (history.has(candidate.seat)) {
    warnings.push({ code: 'repeat_seat', text: `Этот игрок сегодня уже сидел на месте №${candidate.seat} за этим столом. Рекомендуем выбрать другое место.` });
  }
  return warnings;
}

/**
 * Deterministic plan using preassigned reservations, balanced participation
 * and per-table seat rotation. No results of not-yet-played games are guessed.
 * Input slots enumerate only real games/table seats; vacancies remain empty.
 */
export function planEveningSeats(
  slots: EveningSeatCandidate[],
  players: EveningPlayer[],
  existing: EveningSeat[],
  capacity = 10,
): EveningSeat[] {
  const planned = [...existing];
  const counts = new Map(players.map((player) => [player.id, existing.filter((seat) => seat.playerId === player.id).length]));
  for (const slot of slots.slice().sort((a, b) => a.game - b.game || a.tableId.localeCompare(b.tableId) || a.seat - b.seat)) {
    if (planned.some((entry) => gameTableKey(entry.game, entry.tableId, entry.seat) === gameTableKey(slot.game, slot.tableId, slot.seat))) continue;
    const candidates = players.filter((player) => player.eligibleGames.includes(slot.game)
      && !planned.some((entry) => entry.game === slot.game && entry.playerId === player.id))
      .map((player) => ({
        player,
        warnings: seatingWarnings({ ...slot, playerId: player.id }, planned, player.eligibleGames, capacity),
      }))
      .filter((item) => item.warnings.length === 0)
      .sort((a, b) => (counts.get(a.player.id) || 0) - (counts.get(b.player.id) || 0) || a.player.id.localeCompare(b.player.id));
    const chosen = candidates[0]?.player;
    if (!chosen) continue;
    planned.push({ ...slot, playerId: chosen.id });
    counts.set(chosen.id, (counts.get(chosen.id) || 0) + 1);
  }
  return planned;
}
