import { describe, expect, it } from 'vitest';
import { applyPokerAction, compareHands, createPokerHand, type PokerCard, type PokerState } from '../server/services/pokerEngine.ts';
import { createPokerLobby, joinPokerLobby, nextPokerHand, publicPokerLobby, startPokerLobby } from '../server/services/pokerLobbyService.ts';

const c = (text: string): PokerCard => ({ rank: text[0] as PokerCard['rank'], suit: ({ c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' } as const)[text[1] as 'c'] });
const cards = (text: string) => text.split(' ').map(c);
const seat = (state: PokerState, id: string) => state.players.find((player) => player.id === id)!;

describe('poker rules (owner check 2026-10-01)', () => {
  it('compares hands as numbers: a pair of aces beats a pair of nines', () => {
    const hand = createPokerHand({ id: 'cmp', players: [{ id: 'a', nickname: 'A', seat: 1, chips: 1000 }, { id: 'b', nickname: 'B', seat: 2, chips: 1000 }] });
    hand.board = cards('2c 7d Jh 4s 3h');
    hand.hole_cards = { a: cards('Ac Ad'), b: cards('9c 9d') };
    expect(compareHands(hand)).toEqual(['a']);
  });

  it('treats A-2-3-4-5 as the lowest straight', () => {
    const hand = createPokerHand({ id: 'wheel', players: [{ id: 'a', nickname: 'A', seat: 1, chips: 1000 }, { id: 'b', nickname: 'B', seat: 2, chips: 1000 }] });
    hand.board = cards('2c 3d 4h 5s Kh');
    hand.hole_cards = { a: cards('Ac Qd'), b: cards('6c Td') };
    expect(compareHands(hand)).toEqual(['b']);
  });

  it('after the flop the player left of the dealer speaks first', () => {
    const hand = createPokerHand({ id: 'order', dealer_seat: 1, players: [1, 2, 3].map((n) => ({ id: `p${n}`, nickname: `P${n}`, seat: n, chips: 1000 })) });
    expect(hand.current_seat).toBe(1); // under the gun after big blind on seat 3
    applyPokerAction(hand, { type: 'call' });
    applyPokerAction(hand, { type: 'call' });
    applyPokerAction(hand, { type: 'check' });
    expect(hand.street).toBe('flop');
    expect(hand.current_seat).toBe(2);
  });

  it('a player facing an all-in must still decide, then the board runs out and side pots are paid', () => {
    const hand = createPokerHand({ id: 'allin', dealer_seat: 1, players: [
      { id: 'short', nickname: 'S', seat: 1, chips: 100 },
      { id: 'big1', nickname: 'B1', seat: 2, chips: 1000 },
      { id: 'big2', nickname: 'B2', seat: 3, chips: 1000 },
    ] });
    hand.deck = cards('2c 2d 7h Jh 4s 9s 3h 8c');
    hand.hole_cards = { short: cards('4c 3d'), big1: cards('Kc Kd'), big2: cards('Qc Qd') };
    applyPokerAction(hand, { type: 'bet', amount: 100 }); // short all-in
    expect(hand.current_seat).toBe(2);
    applyPokerAction(hand, { type: 'bet', amount: 500 });
    expect(hand.street).toBe('preflop');
    applyPokerAction(hand, { type: 'bet', amount: 1000 }); // big2 all-in
    expect(hand.street).toBe('preflop');
    expect(hand.current_seat).toBe(2);
    applyPokerAction(hand, { type: 'call' });
    expect(hand.street).toBe('finished');
    expect(hand.board).toHaveLength(5);
    expect(hand.players.reduce((sum, player) => sum + player.chips, 0)).toBe(2100);
    expect(seat(hand, 'short').chips).toBe(0);
    expect(seat(hand, 'big1').chips).toBe(2100); // kings take the main pot and the side pot
    expect(seat(hand, 'big2').chips).toBe(0);
  });

  it('a short all-in can win only the main pot', () => {
    const hand = createPokerHand({ id: 'side', dealer_seat: 1, players: [
      { id: 'short', nickname: 'S', seat: 1, chips: 100 },
      { id: 'big1', nickname: 'B1', seat: 2, chips: 1000 },
      { id: 'big2', nickname: 'B2', seat: 3, chips: 1000 },
    ] });
    hand.deck = cards('2c 2d 7h Jh 4s 9s 3h 8c'); // burn, flop, burn, turn, burn, river
    hand.hole_cards = { short: cards('Ac Ad'), big1: cards('Kc Kd'), big2: cards('Qc Qd') };
    applyPokerAction(hand, { type: 'bet', amount: 100 });
    applyPokerAction(hand, { type: 'bet', amount: 1000 });
    applyPokerAction(hand, { type: 'call' });
    expect(hand.street).toBe('finished');
    expect(seat(hand, 'short').chips).toBe(300);
    expect(seat(hand, 'big1').chips).toBe(1800);
    expect(seat(hand, 'big2').chips).toBe(0);
    expect(hand.revealed_ids.sort()).toEqual(['big1', 'big2', 'short']);
  });

  it('a short all-in does not lower the bet others face', () => {
    // Dealer seat 3: small blind seat 1 (short), big blind seat 2, seat 3 speaks first.
    const hand = createPokerHand({ id: 'short-bet', dealer_seat: 3, players: [
      { id: 'short', nickname: 'S', seat: 1, chips: 50 },
      { id: 'b', nickname: 'B', seat: 2, chips: 1000 },
      { id: 'c', nickname: 'C', seat: 3, chips: 1000 },
    ] });
    applyPokerAction(hand, { type: 'bet', amount: 300 });
    applyPokerAction(hand, { type: 'bet', amount: 50 }); // small blind all-in for 50 in total
    expect(hand.current_bet).toBe(300);
    expect(hand.current_seat).toBe(2);
  });

  it('deals the next hand with the chips left and moves the dealer button', () => {
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    joinPokerLobby(lobby, { id: 'g', nickname: 'Guest' });
    startPokerLobby(lobby, 'o');
    const firstDealer = lobby.hand!.dealer_seat;
    expect(() => nextPokerHand(lobby, 'o')).toThrow();
    applyPokerAction(lobby.hand!, { type: 'fold' });
    const view = publicPokerLobby(lobby, 'g');
    expect(view.hand?.can_deal_next).toBe(true);
    expect(view.hand?.burn_cards).toEqual([]);
    nextPokerHand(lobby, 'g');
    expect(lobby.hand!.street).toBe('preflop');
    expect(lobby.hand!.dealer_seat).not.toBe(firstDealer);
    expect(lobby.players.reduce((sum, player) => sum + player.chips, 0)).toBe(2000);
  });

  it('shows opponents cards only after a showdown', () => {
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    joinPokerLobby(lobby, { id: 'g', nickname: 'Guest' });
    startPokerLobby(lobby, 'o');
    expect(Object.keys(publicPokerLobby(lobby, 'o').hand!.hole_cards)).toEqual(['o']);
    lobby.hand!.revealed_ids = ['o', 'g'];
    lobby.hand!.street = 'finished';
    expect(Object.keys(publicPokerLobby(lobby, 'o').hand!.hole_cards).sort()).toEqual(['g', 'o']);
  });
});
