import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPokerAction, compareHands, createPokerHand, describeHand, minRaiseTotal, pokerHandLabel, type PokerCard, type PokerState } from '../server/services/pokerEngine.ts';
import { BOT_THINK_MS, botThinkMs, NEXT_HAND_DELAY_MS, addPokerBot, removeBustedPokerBots, createPokerLobby, leavePokerLobby, listPokerLobbies, kickPokerPlayer, POKER_AFK_LEAVE_MS, removeIdlePokerSeats, touchPokerSeat, resetDefaultPokerRuntimeForTesting, setPokerSitOut, joinPokerLobby, rebuyPoker, nextPokerHand, publicPokerLobby, startPokerLobby, tickPokerLobby } from '../server/services/pokerLobbyService.ts';

const c = (text: string): PokerCard => ({ rank: text[0] as PokerCard['rank'], suit: ({ c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' } as const)[text[1] as 'c'] });
const cards = (text: string) => text.split(' ').map(c);
const seat = (state: PokerState, id: string) => state.players.find((player) => player.id === id)!;

describe('poker rules (owner check 2026-10-01)', () => {
  beforeEach(() => resetDefaultPokerRuntimeForTesting());
  it('lists the whole roster of a table, bots marked, and drops a player who left', () => {
    const lobby = createPokerLobby({ id: 'a', nickname: 'Аня' });
    joinPokerLobby(lobby, { id: 'b', nickname: 'Боря' });
    addPokerBot(lobby);
    const listed = () => listPokerLobbies().find((item) => item.id === lobby.id)!.players;
    expect(listed().map((player) => player.nickname)).toContain('Боря');
    expect(listed().filter((player) => player.is_bot)).toHaveLength(1);
    expect(listed()).toHaveLength(3);
    leavePokerLobby(lobby, 'b');
    expect(listed().map((player) => player.id)).not.toContain('b');
  });
  describe('AFK people are taken off the table (owner, 2026-10-05: more than 5 minutes)', () => {
    const MIN = 60_000;
    const table = () => {
      const lobby = createPokerLobby({ id: 'a', nickname: 'Аня' });
      joinPokerLobby(lobby, { id: 'b', nickname: 'Боря' });
      addPokerBot(lobby);
      return lobby;
    };
    const ids = (lobby: ReturnType<typeof table>) => lobby.players.map((player) => player.id);

    it('removes a person who stopped asking for the table, and only him', () => {
      const lobby = table();
      const t0 = Date.now();
      touchPokerSeat(lobby, 'a', t0); touchPokerSeat(lobby, 'b', t0);
      expect(removeIdlePokerSeats(lobby, t0 + 4 * MIN)).toHaveLength(0);
      touchPokerSeat(lobby, 'a', t0 + 4 * MIN);
      expect(removeIdlePokerSeats(lobby, t0 + POKER_AFK_LEAVE_MS + MIN)).toHaveLength(1);
      expect(ids(lobby)).toContain('a');
      expect(ids(lobby)).not.toContain('b');
      expect(lobby.players.some((player) => player.is_bot)).toBe(true);
    });

    it('removes a person who is away for more than five minutes even while his screen stays open', () => {
      const lobby = table();
      const t0 = Date.now();
      setPokerSitOut(lobby, 'b', true);
      for (let minute = 0; minute <= 6; minute += 1) { touchPokerSeat(lobby, 'a', t0 + minute * MIN); touchPokerSeat(lobby, 'b', t0 + minute * MIN); }
      expect(removeIdlePokerSeats(lobby, t0)).toHaveLength(0);
      expect(removeIdlePokerSeats(lobby, t0 + 4 * MIN)).toHaveLength(0);
      expect(removeIdlePokerSeats(lobby, t0 + 6 * MIN)).toHaveLength(1);
      expect(ids(lobby)).not.toContain('b');
      expect(ids(lobby)).toContain('a');
    });

    it('starts the clock after a restart instead of kicking everybody at once, and never kicks bots', () => {
      resetDefaultPokerRuntimeForTesting();
      const lobby = table();
      const t0 = Date.now() + 10 * MIN;
      resetDefaultPokerRuntimeForTesting();
      const restored = createPokerLobby({ id: 'c', nickname: 'Ваня' });
      addPokerBot(restored);
      resetDefaultPokerRuntimeForTesting();
      expect(removeIdlePokerSeats(lobby, t0)).toHaveLength(0);
      expect(removeIdlePokerSeats(lobby, t0 + 4 * MIN)).toHaveLength(0);
      expect(removeIdlePokerSeats(lobby, t0 + 6 * MIN)).toHaveLength(2);
      expect(lobby.players.every((player) => player.is_bot)).toBe(true);
    });
  });

  it('takes a person with no chips off the table after five minutes: he cannot go «away» himself', () => {
    const MIN = 60_000;
    const lobby = createPokerLobby({ id: 'a', nickname: 'Аня' });
    joinPokerLobby(lobby, { id: 'b', nickname: 'Боря' });
    lobby.players.find((player) => player.id === 'b')!.chips = 0;
    const t0 = Date.now();
    touchPokerSeat(lobby, 'a', t0);
    // his screen stays open, he only has no chips
    for (let minute = 0; minute <= 6; minute += 1) { touchPokerSeat(lobby, 'a', t0 + minute * MIN); touchPokerSeat(lobby, 'b', t0 + minute * MIN); }
    expect(removeIdlePokerSeats(lobby, t0)).toHaveLength(0);
    expect(removeIdlePokerSeats(lobby, t0 + 4 * MIN)).toHaveLength(0);
    expect(removeIdlePokerSeats(lobby, t0 + 6 * MIN)).toHaveLength(1);
    expect(lobby.players.map((player) => player.id)).toEqual(['a']);
  });

  it('does not reuse a previous-hand stack when the same person leaves and rejoins', () => {
    const lobby = createPokerLobby({ id: 'a', nickname: 'Аня' });
    joinPokerLobby(lobby, { id: 'b', nickname: 'Боря' });
    startPokerLobby(lobby, 'a');
    lobby.hand!.street = 'finished';
    lobby.hand!.finished_at = Date.now();
    lobby.hand!.players.find((player) => player.id === 'a')!.chips = 5000;
    leavePokerLobby(lobby, 'a');

    expect(() => joinPokerLobby(lobby, { id: 'a', nickname: 'Аня' })).toThrow('следующей раздачи');
    nextPokerHand(lobby);
    expect(lobby.hand).toBeNull();
    expect(() => joinPokerLobby(lobby, { id: 'a', nickname: 'Аня' })).not.toThrow();
    expect(lobby.players.find((player) => player.id === 'a')?.chips).toBe(1000);
  });

  it('a rebuy brings a person who was away back to the table', () => {
    const lobby = createPokerLobby({ id: 'a', nickname: 'Аня' });
    joinPokerLobby(lobby, { id: 'b', nickname: 'Боря' });
    const seat = lobby.players.find((player) => player.id === 'b')!;
    seat.chips = 0;
    setPokerSitOut(lobby, 'b', true);
    expect(seat.sitting_out).toBe(true);
    rebuyPoker(lobby, 'b');
    expect(seat.sitting_out).toBe(false);
    expect(seat.chips).toBeGreaterThan(0);
  });

  it('the owner can take a person off the table, a bot has its own button', () => {
    const lobby = createPokerLobby({ id: 'a', nickname: 'Аня' });
    joinPokerLobby(lobby, { id: 'b', nickname: 'Боря' });
    addPokerBot(lobby);
    const bot = lobby.players.find((player) => player.is_bot)!;
    expect(() => kickPokerPlayer(lobby, bot.id)).toThrow();
    expect(() => kickPokerPlayer(lobby, 'nobody')).toThrow();
    kickPokerPlayer(lobby, 'b');
    expect(lobby.players.map((player) => player.id)).not.toContain('b');
  });

  it('a bot folds and checks quickly, calls a bit later and raises last, never longer than BOT_THINK_MS', () => {
    expect(botThinkMs({ type: 'fold' })).toBeLessThan(botThinkMs({ type: 'call' }));
    expect(botThinkMs({ type: 'check' })).toBe(botThinkMs({ type: 'fold' }));
    expect(botThinkMs({ type: 'call' })).toBeLessThan(botThinkMs({ type: 'bet' }));
    for (const type of ['fold', 'check', 'call', 'bet', 'all_in']) expect(botThinkMs({ type })).toBeLessThanOrEqual(BOT_THINK_MS);
    // a whole round of seven bots now takes seconds, not tens of seconds
    expect(7 * botThinkMs({ type: 'fold' })).toBeLessThan(4000);
  });

  it('shows «Мест нет» only when nobody can take a seat, and marks the table the viewer sits at', () => {
    const lobby = createPokerLobby({ id: 'a', nickname: 'Аня' });
    for (let i = 0; i < 7; i += 1) addPokerBot(lobby);
    const entry = (viewer?: string) => listPokerLobbies(viewer).find((item) => item.id === lobby.id)!;
    expect(entry().full).toBe(false);
    expect(entry('a').joined).toBe(true);
    expect(entry('z').joined).toBe(false);
    // each newcomer takes the seat of a bot; when eight people sit there, nobody can join any more
    for (let i = 0; i < 7; i += 1) joinPokerLobby(lobby, { id: `h${i}`, nickname: `H${i}` });
    expect(lobby.players.filter((player) => !player.is_bot)).toHaveLength(8);
    expect(entry('h0')).toMatchObject({ full: true, joined: true });
    // a full table of people is not offered to outsiders at all (only the permanent table always is)
    expect(entry('z')).toBeUndefined();
  });

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

  it('deals the next hand by itself after a pause, with the chips left and the dealer button moved', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T20:00:00Z'));
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    joinPokerLobby(lobby, { id: 'g', nickname: 'Guest' });
    startPokerLobby(lobby, 'o');
    const firstDealer = lobby.hand!.dealer_seat;
    expect(() => nextPokerHand(lobby)).toThrow();
    applyPokerAction(lobby.hand!, { type: 'fold' });
    const view = publicPokerLobby(lobby, 'g');
    expect(view.hand?.next_hand_in).toBe(NEXT_HAND_DELAY_MS / 1000);
    expect(view.hand?.burn_cards).toEqual([]);
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS - 1000);
    tickPokerLobby(lobby);
    expect(lobby.hand!.street).toBe('finished');
    vi.advanceTimersByTime(1000);
    tickPokerLobby(lobby);
    vi.useRealTimers();
    expect(lobby.hand!.street).toBe('preflop');
    expect(lobby.hand!.dealer_seat).not.toBe(firstDealer);
    expect(lobby.players.reduce((sum, player) => sum + player.chips, 0)).toBe(2000);
  });

  it('carries reserve and its recovery checkpoint into the next hand', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    joinPokerLobby(lobby, { id: 'g', nickname: 'Guest' });
    startPokerLobby(lobby, 'o');
    applyPokerAction(lobby.hand!, { type: 'fold' });
    const owner = seat(lobby.hand!, 'o');
    owner.reserve_seconds = 17;
    owner.reserve_recovery_at = Date.now() - 30_000;
    nextPokerHand(lobby);
    expect(seat(lobby.hand!, 'o')).toMatchObject({ reserve_seconds: 17, reserve_recovery_at: Date.now() - 30_000 });
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

  it('a raise must be at least the last raise; all-in pushes the whole stack', () => {
    const hand = createPokerHand({ id: 'raise', dealer_seat: 1, players: [1, 2, 3].map((n) => ({ id: `p${n}`, nickname: `P${n}`, seat: n, chips: 1000 })) });
    expect(minRaiseTotal(hand)).toBe(40);
    applyPokerAction(hand, { type: 'bet', amount: 100 }); // raise by 80
    expect(minRaiseTotal(hand)).toBe(180);
    applyPokerAction(hand, { type: 'bet', amount: 120 }); // too small: lifted to the minimum
    expect(hand.current_bet).toBe(180);
    applyPokerAction(hand, { type: 'all_in' });
    expect(seat(hand, 'p3').chips).toBe(0);
    expect(hand.action_log.at(-1)?.type).toBe('all_in');
  });

  it('names hands the way poker rooms do and lights up the winning five cards', () => {
    expect(describeHand([2, 12, 9, 7])).toBe('Две пары: дамы и девятки');
    expect(describeHand([5, 14, 10, 8, 4, 2])).toBe('Флеш до туза');
    expect(describeHand([4, 5])).toBe('Стрит до пятёрки');
    expect(describeHand([6, 13, 3])).toBe('Фулл-хаус: короли и тройки');
    const hand = createPokerHand({ id: 'label', dealer_seat: 1, players: [{ id: 'a', nickname: 'A', seat: 1, chips: 100 }, { id: 'b', nickname: 'B', seat: 2, chips: 100 }] });
    hand.hole_cards = { a: cards('Tc Td'), b: cards('Qs 9c') };
    expect(pokerHandLabel(hand, 'a')).toBe('Пара десяток');
    // One combination, never «старшая карта … кикер …» side by side.
    expect(pokerHandLabel(hand, 'b')).toBe('Старшая карта: дама');
    hand.deck = cards('2h 7s Qc 9d 3h 2d 3s 7c');
    applyPokerAction(hand, { type: 'all_in' });
    applyPokerAction(hand, { type: 'call' });
    expect(hand.winner_ids).toEqual(['b']);
    const winning = hand.winning_cards.map((card) => card.rank + card.suit[0]);
    expect(winning).toHaveLength(5);
    expect(winning).toEqual(expect.arrayContaining(['Qs', 'Qc', '9c', '9d']));
  });

  it('fills a table with several bots that wait a moment before acting', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T21:00:00Z'));
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    for (let i = 0; i < 7; i += 1) addPokerBot(lobby);
    expect(lobby.players).toHaveLength(8);
    expect(new Set(lobby.players.map((player) => player.nickname)).size).toBe(8);
    expect(() => addPokerBot(lobby)).toThrow();
    startPokerLobby(lobby, 'o');
    const before = lobby.hand!.current_seat;
    tickPokerLobby(lobby);
    expect(lobby.hand!.current_seat).toBe(before);
    vi.advanceTimersByTime(BOT_THINK_MS);
    tickPokerLobby(lobby);
    vi.useRealTimers();
    expect(lobby.hand!.action_log.length).toBe(3);
  });

  it('a bot that lost all its chips leaves the table, so a full table of bots does not lock newcomers out', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    for (let i = 0; i < 7; i += 1) addPokerBot(lobby);
    startPokerLobby(lobby, 'o');
    expect(lobby.players).toHaveLength(8);
    const bots = lobby.players.filter((player) => player.is_bot);
    // the hand ends with three bots without chips; the human and the other bots still have theirs
    lobby.hand!.street = 'finished'; lobby.hand!.finished_at = Date.now();
    for (const bot of bots.slice(0, 3)) lobby.hand!.players.find((player) => player.id === bot.id)!.chips = 0;
    tickPokerLobby(lobby);
    // the seats are free at once, before the pause between hands is over
    expect(lobby.players).toHaveLength(5);
    expect(lobby.players.some((player) => bots.slice(0, 3).some((bot) => bot.id === player.id))).toBe(false);
    expect(() => joinPokerLobby(lobby, { id: 'late', nickname: 'Late' })).not.toThrow();
    expect(lobby.players).toHaveLength(6);
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS);
    tickPokerLobby(lobby);
    vi.useRealTimers();
    // the next hand is dealt without them; the human is still seated
    expect(lobby.hand!.players.map((player) => player.id)).not.toContain(bots[0].id);
    expect(lobby.players.some((player) => player.id === 'o')).toBe(true);
  });

  it('a person can sit down at a table that is full of bots: the weakest bot gives up its seat', () => {
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    for (let i = 0; i < 7; i += 1) addPokerBot(lobby);
    const bots = lobby.players.filter((player) => player.is_bot);
    bots[3].chips = 400;
    startPokerLobby(lobby, 'o');
    joinPokerLobby(lobby, { id: 'late', nickname: 'Late' });
    expect(lobby.players).toHaveLength(8);
    expect(lobby.players.some((player) => player.id === 'late')).toBe(true);
    expect(lobby.players.some((player) => player.id === bots[3].id)).toBe(false);
    expect(lobby.players.filter((player) => player.is_bot)).toHaveLength(6);
    // the person who was there keeps the seat
    expect(lobby.players.some((player) => player.id === 'o')).toBe(true);
  });

  it('a table full of people is still full', () => {
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    for (let i = 1; i < 8; i += 1) joinPokerLobby(lobby, { id: `h${i}`, nickname: `H${i}` });
    expect(() => joinPokerLobby(lobby, { id: 'extra', nickname: 'Extra' })).toThrow('максимум 8');
  });

  it('a person without chips keeps the seat (rebuy), only bots are sent away', () => {
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    addPokerBot(lobby);
    startPokerLobby(lobby, 'o');
    lobby.hand!.street = 'finished'; lobby.hand!.finished_at = Date.now();
    lobby.hand!.players.find((player) => player.id === 'o')!.chips = 0;
    expect(removeBustedPokerBots(lobby)).toBe(0);
    expect(lobby.players.map((player) => player.id)).toContain('o');
  });

  it('a waiting table drops a bot with an empty stack too', () => {
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    addPokerBot(lobby);
    lobby.players.find((player) => player.is_bot)!.chips = 0;
    expect(removeBustedPokerBots(lobby)).toBe(1);
    expect(lobby.players.map((player) => player.id)).toEqual(['o']);
  });

  it('the table stays open: a newcomer sits down mid-hand and plays from the next hand', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T22:00:00Z'));
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    joinPokerLobby(lobby, { id: 'g', nickname: 'Guest' });
    startPokerLobby(lobby, 'o');
    expect(listPokerLobbies().some((item) => item.id === lobby.id && item.status === 'playing')).toBe(true);
    joinPokerLobby(lobby, { id: 'late', nickname: 'Late' });
    expect(lobby.hand!.players.some((player) => player.id === 'late')).toBe(false);
    expect(publicPokerLobby(lobby, 'late').hand?.waiting_for_next_hand).toBe(true);
    applyPokerAction(lobby.hand!, { type: 'fold' });
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS);
    tickPokerLobby(lobby);
    vi.useRealTimers();
    expect(lobby.hand!.players.map((player) => player.id)).toContain('late');
  });

  it('leaving folds the cards, frees the seat and hands the table to another person', () => {
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    joinPokerLobby(lobby, { id: 'g', nickname: 'Guest' });
    joinPokerLobby(lobby, { id: 'h', nickname: 'Third' });
    startPokerLobby(lobby, 'o');
    const notOnTurn = lobby.hand!.players.find((player) => player.seat !== lobby.hand!.current_seat && player.id !== 'g')!;
    leavePokerLobby(lobby, notOnTurn.id);
    expect(lobby.hand!.players.find((player) => player.id === notOnTurn.id)?.folded).toBe(true);
    expect(lobby.players.some((player) => player.id === notOnTurn.id)).toBe(false);
    if (notOnTurn.id === 'o') expect(lobby.ownerId).not.toBe('o');
    joinPokerLobby(lobby, { id: 'n', nickname: 'New' });
    expect(new Set(lobby.players.map((player) => player.seat)).size).toBe(lobby.players.length);
    leavePokerLobby(lobby, 'g'); leavePokerLobby(lobby, 'h'); leavePokerLobby(lobby, 'o');
    expect(leavePokerLobby(lobby, 'n')).toBeNull();
  });

  it('a raise is logged as a raise, a first bet as a bet', () => {
    const hand = createPokerHand({ id: 'log', dealer_seat: 1, players: [1, 2, 3].map((n) => ({ id: `p${n}`, nickname: `P${n}`, seat: n, chips: 1000 })) });
    applyPokerAction(hand, { type: 'bet', amount: 60 });
    expect(hand.action_log.at(-1)?.type).toBe('raise');
  });

  it('a player whose time runs out is away: not dealt in until they come back, the seat stays', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T23:00:00Z'));
    const lobby = createPokerLobby({ id: 'o', nickname: 'Owner' });
    joinPokerLobby(lobby, { id: 'g', nickname: 'Guest' });
    joinPokerLobby(lobby, { id: 'h', nickname: 'Third' });
    startPokerLobby(lobby, 'o');
    const slow = lobby.hand!.players.find((player) => player.seat === lobby.hand!.current_seat)!;
    vi.advanceTimersByTime(81_000);
    tickPokerLobby(lobby);
    expect(lobby.players.find((player) => player.id === slow.id)?.sitting_out).toBe(true);
    // Finish the hand and wait for the next one: the away player is not dealt in.
    while (lobby.hand!.street !== 'finished') { tickPokerLobby(lobby); const turn = lobby.hand!.players.find((player) => player.seat === lobby.hand!.current_seat); if (!turn) break; applyPokerAction(lobby.hand!, { type: 'fold' }); }
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS);
    tickPokerLobby(lobby);
    expect(lobby.hand!.players.map((player) => player.id)).not.toContain(slow.id);
    expect(lobby.players.some((player) => player.id === slow.id)).toBe(true);
    setPokerSitOut(lobby, slow.id, false);
    applyPokerAction(lobby.hand!, { type: 'fold' });
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS);
    tickPokerLobby(lobby);
    vi.useRealTimers();
    expect(lobby.hand!.players.map((player) => player.id)).toContain(slow.id);
  });
});
