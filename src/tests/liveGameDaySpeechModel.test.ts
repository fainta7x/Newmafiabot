import { describe, expect, it } from 'vitest';
import { createEmptyActivePlayer } from '../components/LiveGameEngine/engineStateModel.js';
import {
  getDaySpeakerQueue,
  getNextDaySpeaker,
  markDaySpeakerSpoken,
} from '../components/LiveGameEngine/daySpeechModel.js';

const createPlayers = () => Array.from({ length: 10 }, (_, index) => ({
  ...createEmptyActivePlayer(index + 1),
  user_id: index + 101,
  nickname: `Player ${index + 1}`,
}));

describe('Live Game day speech model', () => {
  it('starts day one from seat 1 and keeps table order', () => {
    const queue = getDaySpeakerQueue(createPlayers(), 1);
    expect(queue.map((player) => player.slot_num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('rotates the first speaker by round number and wraps after seat 10', () => {
    expect(getDaySpeakerQueue(createPlayers(), 2).map((player) => player.slot_num))
      .toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 1]);
    expect(getDaySpeakerQueue(createPlayers(), 10).map((player) => player.slot_num))
      .toEqual([10, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(getDaySpeakerQueue(createPlayers(), 11).map((player) => player.slot_num))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('skips dead players and players who already spoke', () => {
    const players = createPlayers().map((player) => {
      if (player.slot_num === 2) return { ...player, alive: false };
      if (player.slot_num === 4) return { ...player, has_spoken_this_round: true };
      return player;
    });

    expect(getDaySpeakerQueue(players, 2).map((player) => player.slot_num))
      .toEqual([3, 5, 6, 7, 8, 9, 10, 1]);
    expect(getNextDaySpeaker(players, 2)?.slot_num).toBe(3);
  });

  it('returns null when no eligible speaker remains', () => {
    const players = createPlayers().map((player) => ({ ...player, has_spoken_this_round: true }));
    expect(getNextDaySpeaker(players, 1)).toBeNull();
  });

  it('marks only the selected seat as spoken', () => {
    const players = createPlayers();
    const result = markDaySpeakerSpoken(players, 6);

    expect(result[5].has_spoken_this_round).toBe(true);
    expect(result[5]).not.toBe(players[5]);
    expect(result[4]).toBe(players[4]);
    expect(result[6]).toBe(players[6]);
  });
});
