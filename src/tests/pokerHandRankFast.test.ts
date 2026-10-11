import { describe, expect, it } from 'vitest';
import { createDeck, pokerHandRank, slowPokerHandRank, type PokerCard } from '../server/services/pokerEngine.ts';

// A small deterministic generator, so a failure can be repeated.
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (random: () => number, size: number): PokerCard[] => {
  const deck = createDeck();
  const cards: PokerCard[] = [];
  for (let index = 0; index < size; index += 1) cards.push(deck.splice(Math.floor(random() * deck.length), 1)[0]);
  return cards;
};
const card = (text: string): PokerCard => ({ rank: text.slice(0, -1) as PokerCard['rank'], suit: ({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const)[text.slice(-1) as 's' | 'h' | 'd' | 'c'] });
const hand = (text: string) => text.split(' ').map(card);

describe('the one-pass hand ranking gives exactly the result of ranking every five of the cards', () => {
  it('matches on tens of thousands of random hands of five, six and seven cards', () => {
    const random = seeded(2026);
    for (const size of [5, 6, 7]) {
      for (let round = 0; round < 40_000; round += 1) {
        const cards = pick(random, size);
        const fast = pokerHandRank(cards);
        const slow = slowPokerHandRank(cards);
        if (JSON.stringify(fast) !== JSON.stringify(slow)) throw new Error(`size ${size}: ${JSON.stringify(cards)} fast ${JSON.stringify(fast)} slow ${JSON.stringify(slow)}`);
      }
    }
  });

  it('matches on the awkward combinations: wheels, two trips, three pairs, a flush that hides a straight, quads with a pair', () => {
    for (const text of [
      'Ah 2h 3h 4h 5h 9c Kd', 'Ac 2d 3h 4s 5c 9c Kd', '6s 7s 8s 9s Ts Js 2c', 'Ah Kh Qh Jh Th 2c 3d',
      'Kc Kd Ks 9c 9d 9h 2s', 'Kc Kd Ks 9c 9d 2h 2s', 'Kc Kd 9c 9d 5s 5h 2s', 'Kc Kd 9c 9d 5s 5h 5d',
      '2h 4h 6h 8h Jh 3c 5d', '2h 3h 4h 5h 9h 6c 7d', 'Ac Ad Ah As Kc Kd Ks', 'Ac Ad Ah As 2c 2d 3s',
      '2c 3d 4h 5s 6c 7d 8h', 'Ac 2d 3h 4s 6c 7d 8h', 'Ah Kd 9c 7s 4h 3d 2c', 'Ah Ad 9c 7s 4h 3d 2c', 'Th Jh Qh Kh 2h Ac 3d',
    ]) {
      const cards = hand(text);
      expect(pokerHandRank(cards), text).toEqual(slowPokerHandRank(cards));
    }
  });

  it('is much faster than ranking every five', () => {
    const random = seeded(7);
    const hands = Array.from({ length: 3000 }, () => pick(random, 7));
    const time = (rank: (cards: PokerCard[]) => number[]) => { const start = performance.now(); for (const cards of hands) rank(cards); return performance.now() - start; };
    time(pokerHandRank); time(slowPokerHandRank);
    expect(time(pokerHandRank) * 3).toBeLessThan(time(slowPokerHandRank));
  });
});
