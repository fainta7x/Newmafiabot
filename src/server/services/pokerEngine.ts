import { randomInt } from 'node:crypto';

export type PokerSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type PokerRank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A';
export type PokerCard = { rank: PokerRank; suit: PokerSuit };
export type PokerStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
export type PokerPlayer = { id: string; nickname: string; seat: number; chips: number; committed: number; folded: boolean; all_in: boolean; acted: boolean; reserve_seconds: number; is_bot?: boolean;
  /** Everything the player put in during this hand: decides which side pots they can win. */
  total_committed: number };
export type PokerActionLogEntry = { player_id: string; player_name: string; type: 'small_blind' | 'big_blind' | 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in'; amount: number; street: PokerStreet; at: number };
export type PokerState = {
  id: string; players: PokerPlayer[]; dealer_seat: number; current_seat: number | null;
  small_blind_seat: number | null; big_blind_seat: number | null;
  small_blind: number; big_blind: number; pot: number; current_bet: number; street: PokerStreet;
  board: PokerCard[]; hole_cards: Record<string, PokerCard[]>; burn_cards: PokerCard[];
  deck: PokerCard[];
  deck_remaining: number; winner_ids: string[]; last_action: string | null; last_pot_awarded: number;
  /** Players whose cards are shown after a showdown. */
  revealed_ids: string[];
  /** The five cards of the winning hand, lit up after a showdown. */
  winning_cards: PokerCard[];
  /** The last full raise: the next raise must be at least this much more. */
  last_raise_size: number;
  action_log: PokerActionLogEntry[];
  base_turn_seconds: number; max_reserve_seconds: number; turn_started_at: number | null;
  /** When the hand ended: the next one is dealt by itself a few seconds later. */
  finished_at: number | null;
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
  const players: PokerPlayer[] = input.players.map((player) => ({ ...player, committed: 0, total_committed: 0, folded: false, all_in: player.chips <= 0, acted: false, reserve_seconds: 60 }));
  const state: PokerState = {
    id: input.id, players, dealer_seat: input.dealer_seat ?? players[0].seat, current_seat: null, small_blind_seat: null, big_blind_seat: null,
    small_blind: input.small_blind ?? 10, big_blind: input.big_blind ?? 20, pot: 0, current_bet: 0,
    street: 'preflop', board: [], hole_cards: {}, burn_cards: [], deck_remaining: 52, winner_ids: [], last_action: null, last_pot_awarded: 0, revealed_ids: [], winning_cards: [], last_raise_size: input.big_blind ?? 20,
    deck, action_log: [], base_turn_seconds: 20, max_reserve_seconds: 60, turn_started_at: Date.now(), finished_at: null,
  };
  const ordered = players.slice().sort((a, b) => a.seat - b.seat);
  for (const player of ordered) state.hole_cards[player.id] = [deck.shift()!, deck.shift()!];
  const dealerIndex = ordered.findIndex((player) => player.seat === state.dealer_seat);
  const sb = ordered.length === 2 ? ordered[dealerIndex] : ordered[(dealerIndex + 1) % ordered.length];
  const bb = ordered.length === 2 ? ordered[(dealerIndex + 1) % ordered.length] : ordered[(dealerIndex + 2) % ordered.length];
  state.small_blind_seat = sb.seat; state.big_blind_seat = bb.seat;
  const post = (player: PokerPlayer, amount: number) => { const paid = Math.min(amount, player.chips); player.chips -= paid; player.committed += paid; player.total_committed += paid; state.pot += paid; player.all_in = player.chips === 0; };
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
  const wheel = unique.length === 5 && unique.join(',') === '14,5,4,3,2';
  const straight = unique.length === 5 && (unique[0] - unique[4] === 4 || wheel);
  // A-2-3-4-5 is the lowest straight: its top card is the five.
  const straightHigh = wheel ? 5 : unique[0];
  const flush = cards.every((card) => card.suit === cards[0].suit);
  if (straight && flush) return [straightHigh === 14 ? 9 : 8, straightHigh];
  if (groups[0]?.[1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0]?.[1] === 3 && groups[1]?.[1] >= 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straight) return [4, straightHigh];
  if (groups[0]?.[1] === 3) return [3, groups[0][0], ...groups.slice(1).map(([value]) => value)];
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) return [2, groups[0][0], groups[1][0], groups[2]?.[0] || 0];
  if (groups[0]?.[1] === 2) return [1, groups[0][0], ...groups.slice(1).map(([value]) => value)];
  return [0, ...values];
};

/** Positive when `a` beats `b`. Ranks are compared as numbers, never as text. */
export const compareRanks = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  return 0;
};

const bestHand = (cards: PokerCard[]): { rank: number[]; cards: PokerCard[] } => {
  const combinations: PokerCard[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) for (let b = a + 1; b < cards.length - 3; b += 1) for (let c = b + 1; c < cards.length - 2; c += 1) for (let d = c + 1; d < cards.length - 1; d += 1) for (let e = d + 1; e < cards.length; e += 1) combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return combinations.map((combo) => ({ rank: handRankFive(combo), cards: combo })).sort((a, b) => compareRanks(b.rank, a.rank))[0] || { rank: [], cards: [] };
};
const handRank = (cards: PokerCard[]): number[] => bestHand(cards).rank;
/** Rank of the best five of up to seven cards; the bots use it for equity. */
export const pokerHandRank = handRank;

const RANK_ONE: Record<number, string> = { 2: 'двойка', 3: 'тройка', 4: 'четвёрка', 5: 'пятёрка', 6: 'шестёрка', 7: 'семёрка', 8: 'восьмёрка', 9: 'девятка', 10: 'десятка', 11: 'валет', 12: 'дама', 13: 'король', 14: 'туз' };
const RANK_OF: Record<number, string> = { 2: 'двоек', 3: 'троек', 4: 'четвёрок', 5: 'пятёрок', 6: 'шестёрок', 7: 'семёрок', 8: 'восьмёрок', 9: 'девяток', 10: 'десяток', 11: 'валетов', 12: 'дам', 13: 'королей', 14: 'тузов' };
const RANK_MANY: Record<number, string> = { 2: 'двойки', 3: 'тройки', 4: 'четвёрки', 5: 'пятёрки', 6: 'шестёрки', 7: 'семёрки', 8: 'восьмёрки', 9: 'девятки', 10: 'десятки', 11: 'валеты', 12: 'дамы', 13: 'короли', 14: 'тузы' };
const RANK_TO: Record<number, string> = { 2: 'двойки', 3: 'тройки', 4: 'четвёрки', 5: 'пятёрки', 6: 'шестёрки', 7: 'семёрки', 8: 'восьмёрки', 9: 'девятки', 10: 'десятки', 11: 'валета', 12: 'дамы', 13: 'короля', 14: 'туза' };

/** «Две пары: дамы и девятки», «Флеш до туза» — what poker rooms show at a showdown. */
export const describeHand = (rank: number[]) => {
  const [kind, a, b] = rank;
  if (kind === 9) return 'Флеш-рояль';
  if (kind === 8) return `Стрит-флеш до ${RANK_TO[a]}`;
  if (kind === 7) return `Каре ${RANK_OF[a]}`;
  if (kind === 6) return `Фулл-хаус: ${RANK_MANY[a]} и ${RANK_MANY[b]}`;
  if (kind === 5) return `Флеш до ${RANK_TO[a]}`;
  if (kind === 4) return `Стрит до ${RANK_TO[a]}`;
  if (kind === 3) return `Сет ${RANK_OF[a]}`;
  if (kind === 2) return `Две пары: ${RANK_MANY[a]} и ${RANK_MANY[b]}`;
  if (kind === 1) return `Пара ${RANK_OF[a]}`;
  return a ? `Старшая карта: ${RANK_ONE[a]}` : 'Старшая карта';
};

export const pokerHandLabel = (state: PokerState, playerId: string) => {
  const cards = [...(state.hole_cards[playerId] || []), ...state.board];
  if (cards.length < 5) {
    const hole = state.hole_cards[playerId] || [];
    if (hole.length !== 2) return '';
    const [high, low] = hole.map((card) => rankValue(card.rank)).sort((x, y) => y - x);
    // Before the flop there is always a hand: a pocket pair or a high card with its kicker.
    return high === low ? `Пара ${RANK_OF[high]}` : `Старшая карта: ${RANK_ONE[high]}, кикер ${RANK_ONE[low]}`;
  }
  return describeHand(handRank(cards));
};

const bestOf = (state: PokerState, candidates: PokerPlayer[]): PokerPlayer[] => {
  const ranked = candidates.filter((player) => state.hole_cards[player.id]?.length === 2)
    .map((player) => ({ player, rank: handRank([...state.hole_cards[player.id], ...state.board]) }))
    .sort((a, b) => compareRanks(b.rank, a.rank));
  if (!ranked.length) return [];
  return ranked.filter((item) => compareRanks(item.rank, ranked[0].rank) === 0).map((item) => item.player);
};

export const compareHands = (state: PokerState): string[] => bestOf(state, activePlayers(state)).map((player) => player.id);

/**
 * Pays the pot out in layers: a player who went all-in for less can only win what every
 * other player matched of their stake (side pots). An odd chip goes to the first winner by seat.
 */
const awardPot = (state: PokerState) => {
  const contenders = activePlayers(state);
  const winners = new Set<string>();
  const levels = [...new Set(state.players.map((player) => player.total_committed).filter((value) => value > 0))].sort((a, b) => a - b);
  let previous = 0;
  for (const level of levels) {
    const layer = state.players.reduce((sum, player) => sum + Math.max(0, Math.min(player.total_committed, level) - previous), 0);
    previous = level;
    if (!layer) continue;
    let eligible = contenders.filter((player) => player.total_committed >= level);
    if (!eligible.length) eligible = contenders;
    const layerWinners = (eligible.length === 1 ? eligible : bestOf(state, eligible)).slice().sort((a, b) => a.seat - b.seat);
    if (!layerWinners.length) continue;
    const share = Math.floor(layer / layerWinners.length);
    layerWinners.forEach((winner, index) => { winner.chips += share + (index === 0 ? layer - share * layerWinners.length : 0); winners.add(winner.id); });
  }
  state.winner_ids = [...winners];
  state.last_pot_awarded = state.pot;
  state.pot = 0;
  state.street = 'finished';
  state.current_seat = null;
  state.finished_at = Date.now();
};

const showdown = (state: PokerState) => {
  state.street = 'showdown';
  state.revealed_ids = activePlayers(state).map((player) => player.id);
  const best = bestOf(state, activePlayers(state))[0];
  state.winning_cards = best ? bestHand([...state.hole_cards[best.id], ...state.board]).cards : [];
  awardPot(state);
};

export const advanceStreet = (state: PokerState, deck: PokerCard[]) => {
  if (state.street === 'preflop') { burnAndDraw(state, deck, 3); state.street = 'flop'; }
  else if (state.street === 'flop') { burnAndDraw(state, deck, 1); state.street = 'turn'; }
  else if (state.street === 'turn') { burnAndDraw(state, deck, 1); state.street = 'river'; }
  else if (state.street === 'river') showdown(state);
  state.deck_remaining = deck.length;
};

export type PokerAction = { type: 'fold' | 'check' | 'call' | 'bet' | 'all_in'; amount?: number };

/** The smallest «raise to» total: the big blind for a first bet, otherwise the bet plus the last full raise. */
export const minRaiseTotal = (state: PokerState) => state.current_bet === 0 ? state.big_blind : state.current_bet + Math.max(state.big_blind, state.last_raise_size || 0);
export const applyPokerAction = (state: PokerState, action: PokerAction) => {
  if (state.street === 'finished' || state.street === 'showdown') throw new Error('Раздача уже завершена.');
  const player = state.players.find((item) => item.seat === state.current_seat);
  if (!player || player.folded || player.all_in) throw new Error('Сейчас ход другого игрока.');
  const toCall = Math.max(0, state.current_bet - player.committed);
  const betBefore = state.current_bet;
  if (action.type === 'all_in') action = player.chips <= toCall ? { type: 'call' } : { type: 'bet', amount: player.committed + player.chips };
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
    const paid = Math.min(toCall, player.chips); actionAmount = paid; player.chips -= paid; player.committed += paid; player.total_committed += paid; state.pot += paid; player.all_in = player.chips === 0;
  } else if (action.type === 'bet') {
    // «Raise to» total, never below the minimum raise; more than the stack means all-in.
    const total = Math.max(minRaiseTotal(state), Math.floor(Number(action.amount || 0)));
    const paid = Math.min(total - player.committed, player.chips); if (paid <= 0) throw new Error('Некорректный размер ставки.');
    const raisedBy = player.committed + paid - state.current_bet;
    if (raisedBy >= state.last_raise_size) state.last_raise_size = raisedBy;
    // A short all-in never lowers the bet the others already face.
    actionAmount = paid; player.chips -= paid; player.committed += paid; player.total_committed += paid; state.pot += paid; state.current_bet = Math.max(state.current_bet, player.committed); player.all_in = player.chips === 0;
  } else throw new Error('Некорректное действие.');
  player.acted = true; state.last_action = `${player.id}:${action.type}:${actionAmount}`;
  state.action_log.push({ player_id: player.id, player_name: player.nickname, type: player.all_in && actionAmount > 0 ? 'all_in' : action.type === 'bet' && betBefore > 0 ? 'raise' : action.type, amount: actionAmount, street: state.street, at: Date.now() });
  // Long enough for a whole hand: the bots read who raised before the flop.
  state.action_log = state.action_log.slice(-80);
  const active = activePlayers(state);
  if (active.length === 1) { awardPot(state); state.turn_started_at = null; return state; }
  const canAct = active.filter((item) => !item.all_in);
  // The betting round is over when everyone who can still act has matched the bet. A lone player
  // facing only all-ins has nobody to bet against once matched.
  const ready = canAct.every((item) => item.committed === state.current_bet && (item.acted || canAct.length === 1));
  if (ready) {
    state.players.forEach((item) => { item.acted = false; item.committed = 0; });
    state.current_bet = 0;
    state.last_raise_size = state.big_blind;
    if (state.street === 'river') showdown(state);
    else if (canAct.length <= 1) {
      // Nobody can bet any more: deal the rest of the board and show the cards.
      while ((state.street as PokerStreet) !== 'river') advanceStreet(state, state.deck);
      showdown(state);
    } else {
      advanceStreet(state, state.deck);
      // After the flop the first player left of the dealer speaks first.
      state.current_seat = nextSeat(state.players, state.dealer_seat);
      state.turn_started_at = Date.now();
      return state;
    }
  }
  state.current_seat = (state.street as PokerStreet) === 'finished' ? null : nextSeat(state.players, player.seat);
  state.turn_started_at = state.current_seat === null ? null : Date.now();
  return state;
};

/** A player who leaves the table folds at once, even when it is not their turn. */
export const foldOutOfTurn = (state: PokerState, playerId: string) => {
  const player = state.players.find((item) => item.id === playerId);
  if (!player || player.folded || state.street === 'finished') return state;
  if (state.current_seat === player.seat) return applyPokerAction(state, { type: 'fold' });
  player.folded = true;
  state.action_log.push({ player_id: player.id, player_name: player.nickname, type: 'fold', amount: 0, street: state.street, at: Date.now() });
  const active = activePlayers(state);
  if (active.length === 1) { awardPot(state); state.turn_started_at = null; }
  return state;
};

export const pokerTurnRemaining = (state: PokerState, player: PokerPlayer) => {
  const elapsed = state.turn_started_at ? Math.max(0, Math.floor((Date.now() - state.turn_started_at) / 1000)) : 0;
  return { base_seconds: Math.max(0, state.base_turn_seconds - elapsed), reserve_seconds: Math.max(0, player.reserve_seconds - Math.max(0, elapsed - state.base_turn_seconds)) };
};
