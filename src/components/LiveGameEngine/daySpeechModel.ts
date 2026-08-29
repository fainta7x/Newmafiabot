import type { ActivePlayerState } from './types.js';

const normalizeSlot = (slot: number): number => ((slot - 1 + 10) % 10) + 1;

export const getNextDayStarterSlot = (
  players: ActivePlayerState[],
  previousStarterSlot: number,
): number | null => {
  for (let offset = 1; offset <= 10; offset++) {
    const slot = normalizeSlot(previousStarterSlot + offset);
    const player = players.find((item) => item.slot_num === slot);
    if (player?.alive) return slot;
  }
  return null;
};

export const getDaySpeakerQueue = (
  players: ActivePlayerState[],
  starterSlot: number,
): ActivePlayerState[] => {
  const start = normalizeSlot(starterSlot);
  const ordered: ActivePlayerState[] = [];

  for (let offset = 0; offset < 10; offset++) {
    const slot = normalizeSlot(start + offset);
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
