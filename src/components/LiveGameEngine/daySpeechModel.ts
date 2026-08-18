import type { ActivePlayerState } from './types.js';

export const getDaySpeakerQueue = (
  players: ActivePlayerState[],
  roundNumber: number,
): ActivePlayerState[] => {
  const start = ((roundNumber - 1) % 10) + 1;
  const ordered: ActivePlayerState[] = [];

  for (let offset = 0; offset < 10; offset++) {
    const slot = ((start - 1 + offset) % 10) + 1;
    const player = players.find((item) => item.slot_num === slot);
    if (player) ordered.push(player);
  }

  return ordered.filter((player) => player.alive && !player.has_spoken_this_round);
};

export const getNextDaySpeaker = (
  players: ActivePlayerState[],
  roundNumber: number,
): ActivePlayerState | null => getDaySpeakerQueue(players, roundNumber)[0] || null;

export const markDaySpeakerSpoken = (
  players: ActivePlayerState[],
  slot: number,
): ActivePlayerState[] => players.map((player) => player.slot_num === slot
  ? { ...player, has_spoken_this_round: true }
  : player);
