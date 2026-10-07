import { describe, expect, it } from 'vitest';
import { summarizePokerResults } from '../server/services/pokerResultsSummary.ts';
import type { StoredPokerHand } from '../server/services/pokerLobbyService.ts';

const at = Date.UTC(2026, 9, 6, 12);
const hand = (id: string, players: StoredPokerHand['players'], actions: StoredPokerHand['actions']): StoredPokerHand =>
  ({ id, at, small_blind: 10, big_blind: 20, board: [], players, actions });

describe('summarizePokerResults', () => {
  it('counts nets by day and the spots where bots fold', () => {
    const steal = hand('h1', [{ id: 'p1', seat: 1, net: 30, cards: [] }, { id: 'bot-a', seat: 2, net: -20, cards: [] }, { id: 'bot-b', seat: 3, net: -10, cards: [] }], [
      ['preflop', 'bot-b', 'small_blind', 10], ['preflop', 'p1', 'big_blind', 20],
      ['preflop', 'bot-a', 'raise', 50], ['preflop', 'bot-b', 'fold', 0], ['preflop', 'p1', 'raise', 150], ['preflop', 'bot-a', 'fold', 0],
    ]);
    const showdown = hand('h2', [{ id: 'p1', seat: 1, net: -100, cards: [] }, { id: 'bot-a', seat: 2, net: 100, cards: [] }], [
      ['preflop', 'p1', 'raise', 60], ['preflop', 'bot-a', 'call', 40],
      ['flop', 'bot-a', 'bet', 40], ['flop', 'p1', 'call', 40],
    ]);
    const summary = summarizePokerResults([steal, showdown]);
    const person = summary.people[0];
    expect(person).toMatchObject({ player_id: 'p1', hands: 2, net: -70, net_bb: -3.5 });
    expect(person.by_day['2026-10-06']).toEqual({ hands: 2, net: -70, net_bb: -3.5 });
    expect(person.won_without_showdown).toEqual({ hands: 1, net: 30 });
    expect(person.showdowns).toEqual({ hands: 1, won: 0, net: -100 });
    expect(person.preflop_reraise).toEqual({ faced: 1, botsFolded: 1 });
    expect(person.preflop_open).toEqual({ faced: 1, botsFolded: 0 });
    expect(person.facing_bot_bet).toEqual({ faced: 1, folded: 0, called: 1, raised: 0 });
    expect(summary.bots).toMatchObject({ hands: 2, net: 70, net_bb: 3.5 });
  });

  it('treats an all-in call as a call and counts one answer per decision', () => {
    const shortCall = hand('h3', [{ id: 'p1', seat: 1, net: -40, cards: [] }, { id: 'bot-a', seat: 2, net: 80, cards: [] }, { id: 'bot-b', seat: 3, net: -40, cards: [] }], [
      ['flop', 'bot-a', 'bet', 100], ['flop', 'bot-b', 'raise', 300], ['flop', 'p1', 'fold', 0],
      ['turn', 'bot-a', 'bet', 100], ['turn', 'p1', 'all_in', 40], ['turn', 'bot-b', 'fold', 0],
    ]);
    const person = summarizePokerResults([shortCall]).people[0];
    expect(person.facing_bot_bet).toEqual({ faced: 2, folded: 1, called: 1, raised: 0 });
    expect(person.postflop_bet).toEqual({ faced: 0, botsFolded: 0 });
  });
});
