import type { ActivePlayerState } from './types.js';

// Seats go round the table: 10 seats, or 8–9 at a novice table.
const tableSize = (players: ActivePlayerState[]) => Math.max(1, players.length);
const normalizeSlot = (slot: number, size: number): number => ((((slot - 1) % size) + size) % size) + 1;

export const getNextDayStarterSlot = (
  players: ActivePlayerState[],
  previousStarterSlot: number,
): number | null => {
  const size = tableSize(players);
  for (let offset = 1; offset <= size; offset++) {
    const slot = normalizeSlot(previousStarterSlot + offset, size);
    const player = players.find((item) => item.slot_num === slot);
    if (player?.alive) return slot;
  }
  return null;
};

export const getDaySpeakerQueue = (
  players: ActivePlayerState[],
  starterSlot: number,
): ActivePlayerState[] => {
  const size = tableSize(players);
  const start = normalizeSlot(starterSlot, size);
  const ordered: ActivePlayerState[] = [];

  for (let offset = 0; offset < size; offset++) {
    const slot = normalizeSlot(start + offset, size);
    const player = players.find((item) => item.slot_num === slot);
    if (player) ordered.push(player);
  }

  return ordered.filter((player) => player.alive && !player.has_spoken_this_round);
};

export const getNextDaySpeaker = (
  players: ActivePlayerState[],
  starterSlot: number,
): ActivePlayerState | null => getDaySpeakerQueue(players, starterSlot)[0] || null;

export const markDaySpeakerSpoken = (
  players: ActivePlayerState[],
  slot: number,
): ActivePlayerState[] => players.map((player) => player.slot_num === slot
  ? { ...player, has_spoken_this_round: true }
  : player);
