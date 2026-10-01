import { randomInt } from 'node:crypto';

export type PokerSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type PokerRank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A';
export type PokerCard = { rank: PokerRank; suit: PokerSuit };
export type PokerStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
export type PokerPlayer = { id: string; nickname: string; seat: number; chips: number; committed: number; folded: boolean; all_in: boolean; acted: boolean; reserve_seconds: number; is_bot?: boolean };
export type PokerActionLogEntry = { player_id: string; player_name: string; type: 'small_blind' | 'big_blind' | 'fold' | 'check' | 'call' | 'bet'; amount: number; street: PokerStreet; at: number };
export type PokerState = {
  id: string; players: PokerPlayer[]; dealer_seat: number; current_seat: number | null;
  small_blind: number; big_blind: number; pot: number; current_bet: number; street: PokerStreet;
  board: PokerCard[]; hole_cards: Record<string, PokerCard[]>; burn_cards: PokerCard[];
  deck: PokerCard[];
  deck_remaining: number; winner_ids: string[]; last_action: string | null;
  action_log: PokerActionLogEntry[];
  base_turn_seconds: number; max_reserve_seconds: number; turn_started_at: number | null;
};

const SUITS: PokerSuit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS: PokerRank[] = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const rankValue = (rank: PokerRank) => RANKS.indexOf(rank) + 2;

export const createDeck = (): PokerCard[] => SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
export const shuffleDeck = (input: PokerCard[] = createDeck()): PokerCard[] => {
  const deck = input.slice();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const nextSeat = (players: PokerPlayer[], seat: number, includeFolded = false) => {
  const ordered = players.slice().sort((a, b) => a.seat - b.seat);
  return ordered.find((player) => player.seat > seat && !player.all_in && (includeFolded || !player.folded))?.seat
    ?? ordered.find((player) => !player.all_in && (includeFolded || !player.folded))?.seat ?? null;
};

const activePlayers = (state: PokerState) => state.players.filter((player) => !player.folded);
const burnAndDraw = (state: PokerState, deck: PokerCard[], count: number) => {
  const burn = deck.shift();
  if (burn) state.burn_cards.push(burn);
  for (let i = 0; i < count; i += 1) {
    const card = deck.shift();
    if (card) state.board.push(card);
  }
};

export const createPokerHand = (input: { id: string; players: Array<{ id: string; nickname: string; seat: number; chips: number; is_bot?: boolean }>; dealer_seat?: number; small_blind?: number; big_blind?: number }): PokerState => {
  if (input.players.length < 2 || input.players.length > 8) throw new Error('В покерной раздаче должно быть от 2 до 8 игроков.');
  const deck = shuffleDeck();
  const players: PokerPlayer[] = input.players.map((player) => ({ ...player, committed: 0, folded: false, all_in: player.chips <= 0, acted: false, reserve_seconds: 60 }));
  const state: PokerState = {
    id: input.id, players, dealer_seat: input.dealer_seat ?? players[0].seat, current_seat: null,
    small_blind: input.small_blind ?? 10, big_blind: input.big_blind ?? 20, pot: 0, current_bet: 0,
    street: 'preflop', board: [], hole_cards: {}, burn_cards: [], deck_remaining: 52, winner_ids: [], last_action: null,
    deck, action_log: [], base_turn_seconds: 20, max_reserve_seconds: 60, turn_started_at: Date.now(),
  };
  const ordered = players.slice().sort((a, b) => a.seat - b.seat);
  for (const player of ordered) state.hole_cards[player.id] = [deck.shift()!, deck.shift()!];
  const dealerIndex = ordered.findIndex((player) => player.seat === state.dealer_seat);
  const sb = ordered.length === 2 ? ordered[dealerIndex] : ordered[(dealerIndex + 1) % ordered.length];
  const bb = ordered.length === 2 ? ordered[(dealerIndex + 1) % ordered.length] : ordered[(dealerIndex + 2) % ordered.length];
  const post = (player: PokerPlayer, amount: number) => { const paid = Math.min(amount, player.chips); player.chips -= paid; player.committed += paid; state.pot += paid; player.all_in = player.chips === 0; };
  post(sb, state.small_blind); post(bb, state.big_blind); state.current_bet = Math.max(sb.committed, bb.committed);
  state.action_log.push(
    { player_id: sb.id, player_name: sb.nickname, type: 'small_blind', amount: sb.committed, street: 'preflop', at: Date.now() },
    { player_id: bb.id, player_name: bb.nickname, type: 'big_blind', amount: bb.committed, street: 'preflop', at: Date.now() },
  );
  state.current_seat = nextSeat(players, bb.seat);
  state.deck_remaining = deck.length;
  return state;
};

const handRankFive = (cards: PokerCard[]): number[] => {
  const values = cards.map((card) => rankValue(card.rank)).sort((a, b) => b - a);
  const counts = new Map<number, number>(); values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const unique = [...new Set(values)].sort((a, b) => b - a);
  const straight = unique.length >= 5 && (unique[0] - unique[4] === 4 || JSON.stringify(unique.slice(0, 4)) === JSON.stringify([14, 5, 4, 3]));
  const flush = cards.every((card) => card.suit === cards[0].suit);
  if (straight && flush) return [unique[0] === 14 && unique[1] === 13 ? 9 : 8, unique[0]];
  if (groups[0]?.[1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0]?.[1] === 3 && groups[1]?.[1] >= 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straight) return [4, unique[0]];
  if (groups[0]?.[1] === 3) return [3, groups[0][0], ...groups.slice(1).map(([value]) => value)];
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) return [2, groups[0][0], groups[1][0], groups[2]?.[0] || 0];
  if (groups[0]?.[1] === 2) return [1, groups[0][0], ...groups.slice(1).map(([value]) => value)];
  return [0, ...values];
};

const handRank = (cards: PokerCard[]): number[] => {
  const combinations: PokerCard[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) for (let b = a + 1; b < cards.length - 3; b += 1) for (let c = b + 1; c < cards.length - 2; c += 1) for (let d = c + 1; d < cards.length - 1; d += 1) for (let e = d + 1; e < cards.length; e += 1) combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return combinations.map(handRankFive).sort((a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i += 1) if ((b[i] || 0) !== (a[i] || 0)) return (b[i] || 0) - (a[i] || 0); return 0; })[0] || [];
};

export const pokerHandLabel = (state: PokerState, playerId: string) => {
  const cards = [...(state.hole_cards[playerId] || []), ...state.board];
  if (cards.length < 5) return 'Комбинация формируется';
  const names = ['Старшая карта', 'Пара', 'Две пары', 'Сет', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш', 'Флэш-рояль'];
  return names[handRank(cards)[0]] || names[0];
};

export const compareHands = (state: PokerState): string[] => {
  const eligible = activePlayers(state).filter((player) => state.hole_cards[player.id]?.length === 2);
  const ranked = eligible.map((player) => ({ player, rank: handRank([...state.hole_cards[player.id], ...state.board]) })).sort((a, b) => JSON.stringify(b.rank).localeCompare(JSON.stringify(a.rank)));
  if (!ranked.length) return [];
  const best = JSON.stringify(ranked[0].rank);
  return ranked.filter((item) => JSON.stringify(item.rank) === best).map((item) => item.player.id);
};

export const advanceStreet = (state: PokerState, deck: PokerCard[]) => {
  if (state.street === 'preflop') { burnAndDraw(state, deck, 3); state.street = 'flop'; }
  else if (state.street === 'flop') { burnAndDraw(state, deck, 1); state.street = 'turn'; }
  else if (state.street === 'turn') { burnAndDraw(state, deck, 1); state.street = 'river'; }
  else if (state.street === 'river') { state.street = 'showdown'; state.winner_ids = compareHands(state); state.street = 'finished'; }
  state.deck_remaining = deck.length;
};

export type PokerAction = { type: 'fold' | 'check' | 'call' | 'bet'; amount?: number };
export const applyPokerAction = (state: PokerState, action: PokerAction) => {
  if (state.street === 'finished' || state.street === 'showdown') throw new Error('Раздача уже завершена.');
  const player = state.players.find((item) => item.seat === state.current_seat);
  if (!player || player.folded || player.all_in) throw new Error('Сейчас ход другого игрока.');
  const toCall = Math.max(0, state.current_bet - player.committed);
  const elapsed = state.turn_started_at ? Math.max(0, Math.floor((Date.now() - state.turn_started_at) / 1000)) : 0;
  const usedReserve = elapsed > state.base_turn_seconds;
  if (usedReserve) player.reserve_seconds = Math.max(0, player.reserve_seconds - Math.min(player.reserve_seconds, elapsed - state.base_turn_seconds));
  else player.reserve_seconds = Math.min(state.max_reserve_seconds, player.reserve_seconds + 1);
  let actionAmount = 0;
  if (action.type === 'fold') player.folded = true;
  else if (action.type === 'check') {
    if (toCall !== 0) throw new Error(`Нельзя сделать чек: нужно уравнять ${toCall}.`);
  }
  else if (action.type === 'call') {
    const paid = Math.min(toCall, player.chips); actionAmount = paid; player.chips -= paid; player.committed += paid; state.pot += paid; player.all_in = player.chips === 0;
  } else if (action.type === 'bet') {
    const amount = Math.max(state.big_blind, Math.floor(Number(action.amount || 0)));
    const total = Math.max(amount, state.current_bet + state.big_blind);
    const paid = Math.min(total - player.committed, player.chips); if (paid <= 0) throw new Error('Некорректный размер ставки.');
    actionAmount = paid; player.chips -= paid; player.committed += paid; state.pot += paid; state.current_bet = player.committed; player.all_in = player.chips === 0;
  } else throw new Error('Некорректное действие.');
  player.acted = true; state.last_action = `${player.id}:${action.type}:${actionAmount}`;
  state.action_log.push({ player_id: player.id, player_name: player.nickname, type: action.type, amount: actionAmount, street: state.street, at: Date.now() });
  state.action_log = state.action_log.slice(-20);
  const active = activePlayers(state);
  if (active.length === 1) { state.winner_ids = [active[0].id]; active[0].chips += state.pot; state.pot = 0; state.street = 'finished'; state.current_seat = null; return state; }
  const ready = active.filter((item) => !item.all_in).every((item) => item.acted && item.committed === state.current_bet);
  if (ready || active.filter((item) => !item.all_in).length <= 1) {
    state.players.forEach((item) => { item.acted = false; item.committed = 0; });
    state.current_bet = 0;
    if (state.street === 'river') { state.street = 'showdown'; state.winner_ids = compareHands(state); const share = state.winner_ids.length ? Math.floor(state.pot / state.winner_ids.length) : 0; state.winner_ids.forEach((id) => { const winner = state.players.find((item) => item.id === id); if (winner) winner.chips += share; }); state.pot = 0; state.street = 'finished'; state.current_seat = null; }
    else advanceStreet(state, state.deck);
  }
  state.current_seat = state.street === 'finished' ? null : nextSeat(state.players, player.seat);
  state.turn_started_at = state.current_seat === null ? null : Date.now();
  return state;
};

export const pokerTurnRemaining = (state: PokerState, player: PokerPlayer) => {
  const elapsed = state.turn_started_at ? Math.max(0, Math.floor((Date.now() - state.turn_started_at) / 1000)) : 0;
  return { base_seconds: Math.max(0, state.base_turn_seconds - elapsed), reserve_seconds: Math.max(0, player.reserve_seconds - Math.max(0, elapsed - state.base_turn_seconds)) };
};
