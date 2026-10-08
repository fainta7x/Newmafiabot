import { beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction, createPokerHand, type PokerCard } from '../server/services/pokerEngine.ts';
import { chooseStrongBotAction, estimatePokerBotCallReturn, observePokerHand, pokerBotPotLayers, resetPokerBotMemoryForTests } from '../server/services/pokerBot.ts';

const cards = (text: string): PokerCard[] => text.split(' ').map((card) => ({
  rank: card[0] as PokerCard['rank'], suit: ({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const)[card[1] as 's'],
}));
const rng = (seed = 123) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const shove = (stack: number, hole = '7s 2d') => {
  const hand = createPokerHand({ id: 'shove', dealer_seat: 1, players: [
    { id: 'shover', nickname: 'shover', seat: 1, chips: stack },
    { id: 'bot', nickname: 'bot', seat: 2, chips: 1000, is_bot: true },
  ] });
  applyPokerAction(hand, { type: 'all_in' });
  hand.hole_cards.bot = cards(hole);
  return hand;
};

describe('bot EV uses eligible contribution layers', () => {
  beforeEach(resetPokerBotMemoryForTests);

  it('does not buy a deep-stack shove with 72 because of uncallable excess chips', () => {
    for (const seed of [123, 8042, 15961]) {
      for (const stack of [1000, 24220]) {
        const hand = shove(stack);
        expect(chooseStrongBotAction(hand, hand.players[1], rng(seed)).type).toBe('fold');
        const value = estimatePokerBotCallReturn(hand, hand.players[1], new Map([['shover', 0.08]]), rng(seed));
        expect(value.price).toBe(980);
        expect(value.eligible).toBe(2000);
      }
    }
  });

  it('keeps legitimate value calls and learned calls against frequent shoves', () => {
    for (let index = 0; index < 30; index++) observePokerHand({ players: [{ id: 'shover' }, { id: 'bot' }],
      action_log: [{ player_id: 'shover', street: 'preflop', type: 'all_in' }, { player_id: 'bot', street: 'preflop', type: 'fold' }] });
    for (const stack of [1000, 24220]) {
      for (const hole of ['As Ah', 'Kc 9d']) {
        const hand = shove(stack, hole);
        expect(chooseStrongBotAction(hand, hand.players[1], rng()).type).toBe('call');
      }
    }
  });

  it('reconsiders a heads-up shove call when a tight player has already called all-in', () => {
    for (let index = 0; index < 60; index++) {
      observePokerHand({ players: [{ id: 'shover' }, { id: 'bot' }], action_log: [
        { player_id: 'shover', street: 'preflop', type: 'all_in' }, { player_id: 'bot', street: 'preflop', type: 'fold' },
      ] });
      observePokerHand({ players: [{ id: 'caller' }], action_log: [{ player_id: 'caller', street: 'preflop', type: 'fold' }] });
    }
    const headsUp = shove(1000, 'Kc 9d');
    expect(chooseStrongBotAction(headsUp, headsUp.players[1], rng()).type).toBe('call');
    const multiway = createPokerHand({ id: 'multi', dealer_seat: 1, players: ['shover', 'caller', 'bot'].map((id, index) => ({ id, nickname: id, seat: index + 1, chips: 1000 })) });
    applyPokerAction(multiway, { type: 'all_in' }); applyPokerAction(multiway, { type: 'all_in' });
    multiway.hole_cards.bot = cards('Kc 9d');
    expect(chooseStrongBotAction(multiway, multiway.players[2], rng()).type).toBe('fold');
  });

  it('includes folded dead money but not folded players or inaccessible layers', () => {
    const hand = createPokerHand({ id: 'layers', players: [100, 1000, 400, 200].map((chips, index) => ({ id: `p${index}`, nickname: `p${index}`, seat: index + 1, chips })) });
    hand.players.forEach((player, index) => {
      player.total_committed = [100, 1000, 100, 200][index];
      player.committed = player.total_committed;
      player.chips = index === 2 ? 300 : 0;
      player.all_in = index !== 2;
    });
    hand.players[3].folded = true;
    expect(pokerBotPotLayers(hand, hand.players[2], 300)).toEqual([
      { amount: 400, opponents: ['p0', 'p1'] },
      { amount: 300, opponents: ['p1'] },
      { amount: 400, opponents: ['p1'] },
    ]);
  });

  it('values a winnable side pot even when the bot loses the multiway main pot', () => {
    const hand = createPokerHand({ id: 'side', players: [100, 1000, 400].map((chips, index) => ({ id: `p${index}`, nickname: `p${index}`, seat: index + 1, chips })) });
    hand.street = 'river'; hand.board = cards('Qc 7d 2s 9h 3c'); hand.hole_cards.p2 = cards('Ah Ad');
    hand.current_bet = 1000; hand.pot = 1200;
    hand.players.forEach((player, index) => {
      player.total_committed = index === 1 ? 1000 : 100;
      player.committed = player.total_committed;
      player.chips = index === 2 ? 300 : 0;
      player.all_in = index !== 2;
    });
    const ranges = new Map([['p0', { range: 1, boardMin: 0.9 }], ['p1', { range: 1 }]]);
    const value = estimatePokerBotCallReturn(hand, hand.players[2], ranges, rng());
    expect(value.price).toBe(300);
    expect(value.eligible).toBe(900);
    // AA has about 89% equity against the broad deep range on this dry river;
    // the 300-chip main pot is lost, but the 600-chip side pot makes the call profitable.
    expect(value.expected).toBeGreaterThan(500);
    expect(value.expected).toBeLessThan(580);
    // Independent engine settlement: QQ wins the main pot, AA the side pot,
    // and the deep KK player receives its unmatched 600 chips back.
    const settled = structuredClone(hand);
    settled.current_seat = 3;
    settled.hole_cards.p0 = cards('Qh Qd'); settled.hole_cards.p1 = cards('Kh Kd');
    applyPokerAction(settled, { type: 'call' });
    expect(settled.street).toBe('finished');
    expect(settled.players.map((player) => player.chips)).toEqual([300, 600, 600]);
    // Moving the strong short opponent into the side pot removes those winnings.
    hand.players[0].total_committed = 1000; hand.players[0].committed = 1000; hand.pot += 900;
    expect(estimatePokerBotCallReturn(hand, hand.players[2], ranges, rng()).expected).toBe(0);
  });

  it('never credits future calls or folds to an opponent who is already all-in', () => {
    const hand = shove(1000);
    const bot = hand.players[1];
    expect(pokerBotPotLayers(hand, bot, 980, 'call')).toEqual(pokerBotPotLayers(hand, bot, 980));
    expect(pokerBotPotLayers(hand, bot, 980, 'fold')).toEqual(pokerBotPotLayers(hand, bot, 980));
  });

  it('does not let a cheap-call override reopen a losing river showdown call', () => {
    const hand = createPokerHand({ id: 'river', dealer_seat: 1, players: [
      { id: 'shover', nickname: 'shover', seat: 1, chips: 24220 },
      { id: 'bot', nickname: 'bot', seat: 2, chips: 1000 },
    ] });
    applyPokerAction(hand, { type: 'call' }); applyPokerAction(hand, { type: 'check' });
    for (let street = 0; street < 2; street++) {
      applyPokerAction(hand, { type: 'check' }); applyPokerAction(hand, { type: 'check' });
    }
    expect(hand.street).toBe('river');
    applyPokerAction(hand, { type: 'check' }); applyPokerAction(hand, { type: 'all_in' });
    hand.board = cards('As Ks Qs Js 3h'); hand.hole_cards.bot = cards('7c 2d');
    expect(chooseStrongBotAction(hand, hand.players[1], rng()).type).toBe('fold');
  });

  it('learns to avoid a pure bluff against a caller while retaining it against a folder', () => {
    const answer = (response: 'call' | 'fold') => {
      resetPokerBotMemoryForTests();
      for (let index = 0; index < 60; index++) observePokerHand({ players: [{ id: 'op' }, { id: 'bot' }], action_log: [
        { player_id: 'op', street: 'preflop', type: 'call', amount: 20 },
        { player_id: 'bot', street: 'flop', type: 'bet', amount: 20 },
        { player_id: 'op', street: 'flop', type: response, amount: response === 'call' ? 20 : 0 },
      ] });
      const hand = createPokerHand({ id: 'adapt', dealer_seat: 1, players: [
        { id: 'op', nickname: 'op', seat: 1, chips: 1000 }, { id: 'bot', nickname: 'bot', seat: 2, chips: 1000 },
      ] });
      applyPokerAction(hand, { type: 'call' }); applyPokerAction(hand, { type: 'check' });
      hand.board = cards('As 7h 2d'); hand.hole_cards.bot = cards('9c 8d');
      return chooseStrongBotAction(hand, hand.players[1], rng()).type;
    };
    expect(answer('call')).toBe('check');
    expect(answer('fold')).toBe('bet');
  });
});
