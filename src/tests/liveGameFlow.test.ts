import { describe, expect, it } from 'vitest';
import { buildVotingFarewellQueue, determineLiveWinner } from '../lib/liveGameFlow';

const player = (slot_num: number, team: 'Красные' | 'Чёрные', alive = true) => ({ slot_num, team, alive });

describe('live game flow rules', () => {
  it('city wins automatically when no black players remain alive', () => {
    expect(determineLiveWinner([
      player(1, 'Красные'),
      player(2, 'Красные'),
      player(8, 'Чёрные', false),
      player(9, 'Чёрные', false),
      player(10, 'Чёрные', false),
    ])).toBe('Красные');
  });

  it('mafia wins automatically when living black players equal living reds', () => {
    expect(determineLiveWinner([
      player(1, 'Красные'),
      player(2, 'Красные'),
      player(9, 'Чёрные'),
      player(10, 'Чёрные'),
    ])).toBe('Чёрные');
  });

  it('keeps the game running while reds still outnumber blacks', () => {
    expect(determineLiveWinner([
      player(1, 'Красные'),
      player(2, 'Красные'),
      player(3, 'Красные'),
      player(10, 'Чёрные'),
    ])).toBeNull();
  });

  it('gives one voted-out player a farewell minute', () => {
    expect(buildVotingFarewellQueue([4], [4])).toEqual([4]);
  });

  it('gives every player raised by the table a farewell minute in voting order', () => {
    expect(buildVotingFarewellQueue([7, 2, 9], [2, 9, 7])).toEqual([2, 9, 7]);
  });

  it('deduplicates and rejects invalid farewell seats', () => {
    expect(buildVotingFarewellQueue([3, 3, 0, 11, 5], [5, 3])).toEqual([5, 3]);
  });
});
