import { AsyncLocalStorage } from 'node:async_hooks';
import { minRaiseTotal, pokerHandRank, compareRanks, createDeck, type PokerCard, type PokerPlayer, type PokerState } from './pokerEngine.ts';

/**
 * Strong training bots (owner, 2026-10-02): a GTO-style baseline plus adaptation to each opponent.
 *
 * - Before the flop: position-based ranges (open, 3-bet, defend, 4-bet) from a 169-hand strength
 *   order, mixed at the edges like solver strategies; push/fold when the stack is short.
 * - After the flop: Monte Carlo equity against the hands the opponents' actions suggest, pot odds,
 *   value bets and bluffs in a balanced ratio for the bet size, semi-bluffs with draws.
 * - Learning: every finished hand updates each opponent's tendencies (how often they play, raise,
 *   fold to a bet); the bots bluff more against players who fold a lot and value-bet thinner
 *   against players who call too much. The memory lives on the server until a restart.
 */

export type PokerBotAction = { type: 'fold' | 'check' | 'call' | 'bet' | 'all_in'; amount?: number };

const RANK_ORDER = '23456789TJQKA';
const value = (rank: string) => RANK_ORDER.indexOf(rank) + 2;

/** «AKs», «T9o», «77». */
export const handClass = (cards: PokerCard[]) => {
  const [a, b] = cards.slice().sort((x, y) => value(y.rank) - value(x.rank));
  if (a.rank === b.rank) return `${a.rank}${b.rank}`;
  return `${a.rank}${b.rank}${a.suit === b.suit ? 's' : 'o'}`;
};

/** Chen formula: a classic preflop strength score, good enough to order the 169 hands. */
const chenScore = (cls: string) => {
  const hi = value(cls[0]);
  const lo = value(cls[1]);
  const base = hi === 14 ? 10 : hi === 13 ? 8 : hi === 12 ? 7 : hi === 11 ? 6 : hi / 2;
  if (hi === lo) return Math.max(5, base * 2);
  let score = base;
  if (cls[2] === 's') score += 2;
  const gap = hi - lo - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) score += 1;
  return score;
};

/** Each hand class → share of all starting hands that are at least as strong (0..1). */
const PERCENTILE = (() => {
  const classes: string[] = [];
  for (let i = 12; i >= 0; i -= 1) {
    for (let j = i; j >= 0; j -= 1) {
      const hi = RANK_ORDER[i];
      const lo = RANK_ORDER[j];
      if (i === j) classes.push(hi + lo);
      else classes.push(`${hi}${lo}s`, `${hi}${lo}o`);
    }
  }
  const combos = (cls: string) => (cls.length === 2 ? 6 : cls[2] === 's' ? 4 : 12);
  const sorted = classes.sort((x, y) => chenScore(y) - chenScore(x) || combos(x) - combos(y));
  const map = new Map<string, number>();
  let running = 0;
  for (const cls of sorted) { running += combos(cls); map.set(cls, running / 1326); }
  return map;
})();

export const handPercentile = (cards: PokerCard[]) => PERCENTILE.get(handClass(cards)) ?? 1;

/** Suited aces and suited connectors: the hands solvers 3-bet as bluffs. */
const isBluff3Bet = (cls: string) => /^A[2-5]s$/.test(cls) || ['76s', '87s', '98s', 'T9s', 'KTs', 'QTs'].includes(cls);

// ---------- Opponent memory ----------
/** `reraiseChances`: times he acted before the flop facing a raise; `reraises`: how many of them he re-raised. */
type OpponentStats = { hands: number; vpip: number; pfr: number; facedBet: number; foldedToBet: number; postflopAggro: number; postflopPassive: number; reraiseChances: number; reraises: number; /** Hands he moved all-in before the flop. */ preflopShoves: number };
export type OpponentMemory = Map<string, OpponentStats>;
const defaultOpponents: OpponentMemory = new Map();
const memoryStorage = new AsyncLocalStorage<OpponentMemory>();
/** The memory of the current scope: each database (production, sandbox) keeps its own, see `withOpponentMemory`. */
const memory = () => memoryStorage.getStore() || defaultOpponents;
export const createOpponentMemory = (): OpponentMemory => new Map();
export const withOpponentMemory = <T>(opponentMemory: OpponentMemory, callback: () => T) => memoryStorage.run(opponentMemory, callback);
const blankStats = (): OpponentStats => ({ hands: 0, vpip: 0, pfr: 0, facedBet: 0, foldedToBet: 0, postflopAggro: 0, postflopPassive: 0, reraiseChances: 0, reraises: 0, preflopShoves: 0 });

/** Called once per finished hand: what every human (and bot) did, for the bots to adapt. */
export type ObservedPokerHand = { action_log: Array<{ player_id: string; street: string; type: string }>; players: Array<{ id: string }> };
export const observePokerHand = (hand: ObservedPokerHand) => {
  const seen = new Set<string>();
  const voluntary = new Set<string>();
  const raisedPre = new Set<string>();
  const shovedPre = new Set<string>();
  const betOnStreet = new Map<string, boolean>();
  let preflopRaiseCount = 0;
  let lastPreflopRaiser: string | null = null;
  for (const entry of hand.action_log) {
    seen.add(entry.player_id);
    const stats = memory().get(entry.player_id) || blankStats();
    memory().set(entry.player_id, stats);
    if (entry.street === 'preflop') {
      if (entry.type === 'call' || entry.type === 'raise' || entry.type === 'bet' || entry.type === 'all_in') voluntary.add(entry.player_id);
      const raising = entry.type === 'raise' || entry.type === 'bet' || entry.type === 'all_in';
      // Facing someone else's raise: a chance to re-raise (3-bet or more).
      if (entry.type !== 'small_blind' && entry.type !== 'big_blind' && preflopRaiseCount > 0 && lastPreflopRaiser !== entry.player_id) {
        stats.reraiseChances = (stats.reraiseChances || 0) + 1;
        if (raising) stats.reraises = (stats.reraises || 0) + 1;
      }
      if (raising) { raisedPre.add(entry.player_id); preflopRaiseCount += 1; lastPreflopRaiser = entry.player_id; }
      if (entry.type === 'all_in') shovedPre.add(entry.player_id);
      continue;
    }
    if (entry.type === 'small_blind' || entry.type === 'big_blind') continue;
    const facing = betOnStreet.get(entry.street) || false;
    if (facing && entry.player_id) {
      stats.facedBet += 1;
      if (entry.type === 'fold') stats.foldedToBet += 1;
    }
    if (entry.type === 'bet' || entry.type === 'raise' || entry.type === 'all_in') { stats.postflopAggro += 1; betOnStreet.set(entry.street, true); }
    if (entry.type === 'call' || entry.type === 'check') stats.postflopPassive += 1;
  }
  for (const player of hand.players) {
    if (!seen.has(player.id)) continue;
    const stats = memory().get(player.id)!;
    stats.hands += 1;
    if (voluntary.has(player.id)) stats.vpip += 1;
    if (raisedPre.has(player.id)) stats.pfr += 1;
    if (shovedPre.has(player.id)) stats.preflopShoves = (stats.preflopShoves || 0) + 1;
  }
};

/**
 * Population priors from public poker statistics (typical small-stakes regulars and recreational
 * players): about 25% of hands played, about 45% folds to a continuation bet, aggression near 1.
 * Each player's own numbers replace the priors gradually (the prior counts as 10 hands / 10 spots).
 */
const PRIOR = { vpip: 0.25, pfr: 0.15, foldToBet: 0.4, aggression: 1, reraise: 0.08, shove: 0.04, weight: 8 };

export const pokerOpponentProfile = (playerId: string) => {
  const stats = memory().get(playerId);
  if (!stats) return { known: false, vpip: PRIOR.vpip, pfr: PRIOR.pfr, foldToBet: PRIOR.foldToBet, aggression: PRIOR.aggression, reraise: PRIOR.reraise, shove: PRIOR.shove };
  const w = PRIOR.weight;
  return {
    known: stats.hands >= 8,
    vpip: (stats.vpip + PRIOR.vpip * w) / (stats.hands + w),
    pfr: (stats.pfr + PRIOR.pfr * w) / (stats.hands + w),
    foldToBet: (stats.foldedToBet + PRIOR.foldToBet * w) / (stats.facedBet + w),
    aggression: (stats.postflopAggro + PRIOR.aggression * w) / (stats.postflopPassive + w),
    /** How often he re-raises when facing a raise before the flop: about 8% for a regular, 50%+ for a maniac. */
    reraise: ((stats.reraises || 0) + PRIOR.reraise * w) / ((stats.reraiseChances || 0) + w),
    /** Share of hands he moves all-in before the flop: about 4% for a regular, close to 100% for «push any two». */
    shove: ((stats.preflopShoves || 0) + PRIOR.shove * w) / (stats.hands + w),
  };
};

/** Raw counters the bots have learned about every player (owner-only report; the ids of bots are skipped by the caller). */
export const exportPokerOpponentStats = () => [...memory().entries()].map(([id, stats]) => ({ id, ...stats }));

export const resetPokerBotMemoryForTests = () => defaultOpponents.clear();

// ---------- Helpers ----------
const cardKey = (card: PokerCard) => `${card.rank}${card.suit}`;

const preflopActions = (hand: PokerState) => hand.action_log.filter((entry) => entry.street === 'preflop' && entry.type !== 'small_blind' && entry.type !== 'big_blind');

/** How many raises were made before the flop, and who made the last one. */
const preflopRaises = (hand: PokerState) => {
  const raises = preflopActions(hand).filter((entry) => entry.type === 'raise' || entry.type === 'bet' || (entry.type === 'all_in' && entry.amount > 0));
  return { count: raises.length, lastRaiserId: raises.at(-1)?.player_id || null, raisers: new Set(raises.map((entry) => entry.player_id)) };
};

/**
 * A price so small that folding is never right (owner, 2026-10-07: «если доплата ничтожна — это всегда колл»): a bet of up to
 * a quarter of the pot (the call is then at most ~17% of the final pot), or a re-raise to less than twice the bet it raised
 * (a normal re-raise is about 3x). Cheap does not mean weak: novices often make the small re-raise with a strong hand, so
 * the bot pays to see the next card but reads his range from how he plays, not from the size.
 */
export const CHEAP_CALL_SHARE = 0.17;
const streetBetLevels = (hand: PokerState) => {
  const committed = new Map<string, number>();
  const levels: number[] = [];
  let current = 0;
  for (const entry of hand.action_log) {
    if (entry.street !== hand.street) continue;
    const total = (committed.get(entry.player_id) || 0) + (entry.amount || 0);
    committed.set(entry.player_id, total);
    if (total > current) { current = total; levels.push(total); }
  }
  return levels;
};
const isCheapCall = (hand: PokerState, bot: PokerPlayer) => {
  const price = Math.min(Math.max(0, hand.current_bet - bot.committed), bot.chips);
  if (price <= 0) return false;
  if (price / (hand.pot + price) <= CHEAP_CALL_SHARE) return true;
  // A re-raise: the last level over the one before it (the big blind does not count as a raise before the flop).
  const levels = streetBetLevels(hand).filter((level) => hand.street !== 'preflop' || level > hand.big_blind);
  if (levels.length < 2) return false;
  const smallReraise = levels[levels.length - 1] < 2 * levels[levels.length - 2];
  return smallReraise && price <= (bot.chips + bot.committed) * 0.25;
};

/** The bet to call after each raise before the flop (the big blind first): [20, 50, 150] = open to 50, re-raise to 150. */
const preflopBetLevels = (hand: PokerState) => {
  const committed = new Map<string, number>();
  const levels: number[] = [];
  let current = 0;
  for (const entry of hand.action_log) {
    if (entry.street !== 'preflop') continue;
    const total = (committed.get(entry.player_id) || 0) + (entry.amount || 0);
    committed.set(entry.player_id, total);
    if (total > current) { current = total; levels.push(total); }
  }
  return levels;
};

/** Players still to act after the bot before the flop (blinds included): fewer means a later position. */
const playersBehind = (hand: PokerState, bot: PokerPlayer) => {
  const ordered = hand.players.filter((player) => !player.folded).sort((a, b) => a.seat - b.seat);
  const bbIndex = ordered.findIndex((player) => player.seat === hand.big_blind_seat);
  const botIndex = ordered.findIndex((player) => player.id === bot.id);
  if (bbIndex < 0 || botIndex < 0) return 3;
  return (bbIndex - botIndex + ordered.length) % ordered.length;
};

/**
 * Position counted from the button over everybody dealt in, folded or not: 0 = button, 1 = small blind, 2 = big blind,
 * then under the gun and on towards the cutoff (heads-up the button is the small blind).
 */
const positionFromButton = (hand: PokerState, seat: number) => {
  const ordered = hand.players.slice().sort((a, b) => a.seat - b.seat);
  const dealer = ordered.findIndex((player) => player.seat === hand.dealer_seat);
  const index = ordered.findIndex((player) => player.seat === seat);
  if (dealer < 0 || index < 0) return null;
  return { k: (index - dealer + ordered.length) % ordered.length, n: ordered.length };
};

/**
 * How late (0 = under the gun .. 1 = button or small blind) a raiser opened from: late positions open much wider, so
 * the answer to them is wider too.
 */
const openerLateness = (hand: PokerState, openerSeat: number) => {
  const position = positionFromButton(hand, openerSeat);
  if (!position) return 0.5;
  if (position.n <= 3 || position.k <= 1) return 1;
  if (position.k === 2) return 0.5;
  return (position.k - 3) / Math.max(1, position.n - 4);
};

/**
 * Share of all starting hands the bot continues with (calls or re-raises) against ONE open of 2 big blinds from an average
 * position — «защита» in the usual sense. The big blind closes the action at a discount and defends most hands; the
 * button has position and calls a lot; the small blind plays out of position and is tighter; early seats are tightest.
 * Scaled afterwards by the opener's position and style, the size of the raise and the callers already in.
 */
const DEFEND_BASE = { bigBlind: 0.72, button: 0.34, smallBlind: 0.3, cutoff: 0.24, middle: 0.18, early: 0.14 };
const defendBase = (hand: PokerState, bot: PokerPlayer) => {
  const position = positionFromButton(hand, bot.seat);
  if (!position) return DEFEND_BASE.middle;
  if (hand.big_blind_seat === bot.seat) return DEFEND_BASE.bigBlind;
  if (position.n === 2 || position.k === 0) return DEFEND_BASE.button;
  if (position.k === 1) return DEFEND_BASE.smallBlind;
  const fromEnd = position.n - 1 - position.k; // 0 = cutoff
  return fromEnd === 0 ? DEFEND_BASE.cutoff : fromEnd === 1 ? DEFEND_BASE.middle : DEFEND_BASE.early;
};
export const defendRange = (hand: PokerState, bot: PokerPlayer, openerSeat: number, openerId: string | null, callers: number) => {
  const sizeBb = hand.current_bet / hand.big_blind;
  // 2 bb is the baseline; every extra half big blind takes about an eighth of the range away.
  const sizeFactor = Math.min(1.1, Math.max(0.4, 1 - 0.25 * (sizeBb - 2)));
  const positionFactor = 0.8 + 0.4 * openerLateness(hand, openerSeat);
  const profile = openerId ? pokerOpponentProfile(openerId) : null;
  // A loose opener has a wide range, a tight one a narrow range: the answer follows what he has shown.
  const styleFactor = profile?.known ? Math.min(1.35, Math.max(0.75, Math.sqrt(profile.vpip / 0.25))) : 1;
  const callersFactor = 1 + 0.12 * Math.min(3, callers);
  return Math.min(0.85, defendBase(hand, bot) * sizeFactor * positionFactor * styleFactor * callersFactor);
};

const OPEN_RANGE: Record<number, number> = { 0: 0, 1: 0.42, 2: 0.46, 3: 0.29, 4: 0.22, 5: 0.18 };
const openRange = (behind: number, tableSize: number) => (tableSize === 2 ? 0.8 : OPEN_RANGE[behind] ?? 0.14);

/** Mixed strategy at the edge of a range, like solver output: the last 20% of the range plays only sometimes. */
const inMixedRange = (percentile: number, range: number, random: () => number) => {
  if (percentile <= range * 0.8) return true;
  if (percentile > range) return false;
  return random() < (range - percentile) / (range * 0.2);
};

const raiseTo = (hand: PokerState, bot: PokerPlayer, total: number): PokerBotAction => {
  const max = bot.committed + bot.chips;
  const target = Math.max(minRaiseTotal(hand), Math.round(total / hand.small_blind) * hand.small_blind);
  if (target >= max * 0.85) return { type: 'all_in' };
  return { type: 'bet', amount: target };
};

const passive = (toCall: number): PokerBotAction => (toCall === 0 ? { type: 'check' } : { type: 'fold' });

export type OpponentRange = number | { range: number; /** The weakest share of hands on this board that still fits his betting (0 = any, 0.5 = better than half of all hands). */ boardMin?: number };

/**
 * How much a hand is worth as a DRAW on the flop or turn, on the same 0..1 scale as «better than that share of hands»:
 * a flush draw, an open-ended straight draw, a gutshot or a combination. Made hands count by their rank; a player who bets
 * or raises with a draw (a semi-bluff) belongs to the range as well (owner, 2026-10-05).
 */
export const drawPotential = (pick: PokerCard[], board: PokerCard[]) => {
  if (board.length < 3 || board.length > 4) return 0;
  const all = [...pick, ...board];
  const suitCounts = new Map<string, number>();
  for (const card of all) suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
  const flushDraw = [...suitCounts.entries()].some(([suit, count]) => count === 4 && pick.some((card) => card.suit === suit));
  const values = new Set<number>();
  for (const card of all) { const v = value(card.rank); values.add(v); if (v === 14) values.add(1); }
  const holeValues = pick.flatMap((card) => (value(card.rank) === 14 ? [14, 1] : [value(card.rank)]));
  let open = false;
  let gut = false;
  const usesHole = (items: number[]) => items.some((item) => holeValues.includes(item));
  const made = (low: number) => [0, 1, 2, 3, 4].every((offset) => values.has(low + offset));
  for (let low = 1; low <= 10; low += 1) if (made(low)) return 0; // already a straight: the made hand counts
  for (let low = 1; low <= 11; low += 1) {
    const run = [low, low + 1, low + 2, low + 3];
    if (run.every((item) => values.has(item)) && usesHole(run) && low > 1 && low + 4 <= 14) open = true;
  }
  for (let low = 1; low <= 10; low += 1) {
    const window = [low, low + 1, low + 2, low + 3, low + 4];
    const present = window.filter((item) => values.has(item));
    if (present.length === 4 && usesHole(present)) gut = true;
  }
  if (flushDraw && (open || gut)) return 0.85;
  if (flushDraw) return 0.62;
  if (open) return 0.6;
  if (gut) return 0.4;
  return 0;
};

const rankKey = (rank: number[]) => rank.reduce((total, value) => total * 15 + value, 0);

/**
 * Monte Carlo equity against opponents whose hands are limited to what their actions suggest: by the starting hand
 * (`range`) and — once they have bet after the flop — by how well the hand fits the board (`boardMin`): somebody who bets
 * has usually hit it, which a range of starting hands alone cannot say.
 */
export const estimateEquity = (hole: PokerCard[], board: PokerCard[], opponentRanges: OpponentRange[], random = Math.random, iterations = 0, rangeAttempts = 8) => {
  const used = new Set([...hole, ...board].map(cardKey));
  const deck = createDeck().filter((card) => !used.has(cardKey(card)));
  const runs = iterations || Math.max(240, Math.round(900 / (opponentRanges.length + 1)));
  const needsBoard = board.length >= 3 && opponentRanges.some((item) => typeof item !== 'number' && (item.boardMin || 0) > 0);
  // How strong every possible hand is on THIS board: a sorted sample of random two-card hands to compare a pick with.
  let boardSample: number[] = [];
  if (needsBoard) {
    const pool = deck.slice();
    for (let i = 0; i < 70; i += 1) {
      const first = pool[Math.floor(random() * pool.length)];
      let second = pool[Math.floor(random() * pool.length)];
      while (second === first) second = pool[Math.floor(random() * pool.length)];
      boardSample.push(rankKey(pokerHandRank([first, second, ...board])));
    }
    boardSample = boardSample.sort((a, b) => a - b);
  }
  const boardStrength = (pick: PokerCard[]) => {
    const key = rankKey(pokerHandRank([...pick, ...board]));
    let low = 0;
    while (low < boardSample.length && boardSample[low] <= key) low += 1;
    const made = low / boardSample.length;
    return board.length < 5 ? Math.max(made, drawPotential(pick, board)) : made;
  };
  let score = 0;
  for (let run = 0; run < runs; run += 1) {
    const pool = deck.slice();
    const draw = () => pool.splice(Math.floor(random() * pool.length), 1)[0];
    const hands: PokerCard[][] = [];
    for (const opponent of opponentRanges) {
      const range = typeof opponent === 'number' ? opponent : opponent.range;
      const boardMin = typeof opponent === 'number' || !needsBoard ? 0 : opponent.boardMin || 0;
      let pick: PokerCard[] = [draw(), draw()];
      // Keep re-drawing while the hand is outside the opponent's likely range (a few tries).
      for (let attempt = 0; attempt < rangeAttempts && (handPercentile(pick) > range || (boardMin > 0 && boardStrength(pick) < boardMin)); attempt += 1) {
        pool.push(...pick);
        pick = [draw(), draw()];
      }
      hands.push(pick);
    }
    const fullBoard = board.slice();
    while (fullBoard.length < 5) fullBoard.push(draw());
    const mine = pokerHandRank([...hole, ...fullBoard]);
    let best = true;
    let ties = 0;
    for (const other of hands) {
      const cmp = compareRanks(mine, pokerHandRank([...other, ...fullBoard]));
      if (cmp < 0) { best = false; break; }
      if (cmp === 0) ties += 1;
    }
    if (best) score += 1 / (ties + 1);
  }
  return score / runs;
};

/** What range each opponent still in the hand probably holds, from their preflop actions. */
export const opponentRanges = (hand: PokerState, bot: PokerPlayer) => {
  const { raisers } = preflopRaises(hand);
  // Ranges depend on how many are dealt in (owner, 2026-10-05): at a full table they follow the 6-max charts, three-handed
  // everybody opens and defends much wider, and heads-up nearly every hand is played, aggressively.
  const seated = hand.players.length;
  const tableWidth = seated <= 2 ? 2.4 : seated === 3 ? 1.5 : seated === 4 ? 1.2 : seated === 5 ? 1.08 : 1;
  const tableAggression = seated <= 2 ? 0.75 : seated === 3 ? 0.88 : 1;
  // Popular lines (owner, 2026-10-02): a bet after the flop narrows the bettor's range, and how much
  // depends on who bets — a tight or passive player rarely bets or c-bets a weak hand.
  // Strength of each aggressive action, from common reads in poker guides: a raise after the flop
  // (check-raise or raise of a bet) and anything on the river are much stronger than a first flop bet.
  // Board texture (owner, 2026-10-05): on a wet board (flush or straight draws about) a check-raise is often a semi-bluff,
  // on a dry one it is mostly a made hand; and a high-card board fits the preflop raiser's range, a low connected one the caller's.
  const flopCards = hand.board.slice(0, 3);
  const suitMax = Math.max(0, ...['spades', 'hearts', 'diamonds', 'clubs'].map((suit) => flopCards.filter((card) => card.suit === suit).length));
  const flopValues = flopCards.map((card) => value(card.rank)).sort((a, b) => a - b);
  const connected = flopValues.length === 3 && flopValues[2] - flopValues[0] <= 4;
  const wet = flopCards.length === 3 && (suitMax >= 2 || connected);
  const topCard = flopValues.at(-1) || 0;
  const highBoard = topCard >= 13;
  const lowBoard = topCard > 0 && topCard <= 9;
  const lineWeight = new Map<string, number>();
  const streetHadBet = new Map<string, boolean>();
  const checkedOn = new Set<string>();
  const streetHadBetBefore = new Set<string>();
  for (const entry of hand.action_log) {
    if (entry.street === 'preflop') continue;
    if (entry.type === 'check') { checkedOn.add(`${entry.street}:${entry.player_id}`); continue; }
    const aggressive = entry.type === 'bet' || entry.type === 'raise' || (entry.type === 'all_in' && entry.amount > 0);
    if (!aggressive) continue;
    const isRaise = streetHadBet.get(entry.street) || entry.type === 'raise';
    const weight = entry.street === 'river' ? (isRaise ? 2.5 : 1.4) : entry.street === 'turn' ? (isRaise ? 2 : 1.2) : isRaise ? 1.8 : 1;
    // Check-raise (owner, 2026-10-05): checking and then raising a bet is a trap line — read it as very strong, so the bot
    // neither folds a good hand at once nor calls it down with a marginal one.
    const checkRaise = isRaise && checkedOn.has(`${entry.street}:${entry.player_id}`);
    // The line decides, not the size (owner, 2026-10-05): a third-pot bet can be a monster and a pot-size bet a bluff.
    // What counts is who bets: the preflop raiser's first bet is a wide continuation bet, and a player in late position
    // bets (and raises) with a wider range than one from early position.
    const bettor = hand.players.find((item) => item.id === entry.player_id);
    const lateness = bettor ? openerLateness(hand, bettor.seat) : 0.5;
    const positionScale = 1.15 - 0.3 * lateness;
    const continuation = !isRaise && raisers.has(entry.player_id) && !streetHadBetBefore.has(entry.player_id);
    // From a third of the pot up, size only nudges the line (0.85 .. 1.15 for a pot-size bet): the same size reads differently
    // from a preflop raiser (wide continuation bet), from a late position and from a player who called before the flop.
    const potBefore = entry.pot ?? 0;
    // A tiny bet is different (owner, 2026-10-07: «1 bb into a 7 bb pot means nothing»; tiny = up to a quarter of the pot):
    // it weighs much less — about a third of a normal bet for a seventh of the pot.
    const sizeRatio = potBefore > 0 ? entry.amount / potBefore : 0.5;
    const sizeNudge = potBefore <= 0 ? 1 : sizeRatio < 0.25
      ? 0.15 + 0.7 * (sizeRatio / 0.25) ** 1.5
      : 0.85 + 0.3 * Math.min(1, Math.max(0, (sizeRatio - 0.33) / 0.67));
    const lineScale = positionScale * (continuation ? 0.7 : 1) * sizeNudge * tableAggression;
    streetHadBetBefore.add(entry.player_id);
    lineWeight.set(entry.player_id, (lineWeight.get(entry.player_id) || 0) + weight * lineScale + (checkRaise ? (wet ? 0.6 : 1) : 0));
    streetHadBet.set(entry.street, true);
  }
  // How each re-raiser (3-bet and later) raised: his raise-to over the bet he faced. Chips paid per action add up to his total.
  const reraiseLine = new Map<string, { level: number; ratio: number; inPosition: boolean }>();
  {
    const total = new Map<string, number>();
    let bet = 0;
    let level = 0;
    let openerId = '';
    for (const entry of hand.action_log) {
      if (entry.street !== 'preflop') break;
      total.set(entry.player_id, (total.get(entry.player_id) || 0) + (entry.amount || 0));
      const mine = total.get(entry.player_id) || 0;
      const raised = entry.type === 'raise' || entry.type === 'bet' || (entry.type === 'all_in' && mine > bet);
      if (!raised) continue;
      level += 1;
      if (level === 1) openerId = entry.player_id;
      if (level >= 2) {
        const me = hand.players.find((item) => item.id === entry.player_id);
        const opener = hand.players.find((item) => item.id === openerId);
        const inPosition = Boolean(me && opener) && openerLateness(hand, me!.seat) > openerLateness(hand, opener!.seat);
        reraiseLine.set(entry.player_id, { level, ratio: bet > 0 ? mine / bet : 3, inPosition });
      }
      bet = Math.max(bet, mine);
    }
  }
  return hand.players
    .filter((player) => player.id !== bot.id && !player.folded)
    .map((player) => {
      const profile = pokerOpponentProfile(player.id);
      const loose = profile.known ? Math.min(0.7, Math.max(0.12, profile.vpip)) : 0.45;
      // GTO-like opening ranges by position (owner, 2026-10-05): under the gun opens ~14% of hands, the button ~42% (6-max charts);
      // a re-raised pot is much tighter. A known player's own VPIP pulls the range toward how he really plays.
      const opened = openerLateness(hand, player.seat);
      const positional = 0.14 + 0.28 * opened;
      const openRangeOf = Math.min(0.85, (profile.known ? (positional + Math.min(0.5, loose)) / 2 : positional) * tableWidth);
      // A re-raise narrows only the player who made it, and by how he made it: a 3-bet from the button or a blind is
      // wider than from early position, and a small one (to ~4 big blinds over a 2 bb open) is wider than a standard
      // 3x — it is mostly a merged or bluffing range, not a monster (owner, 2026-10-05).
      const reraise = reraiseLine.get(player.id);
      let range = raisers.has(player.id) ? openRangeOf : loose;
      if (reraise) {
        const base = reraise.level >= 3 ? 0.05 : 0.07 + 0.06 * opened;
        // Charts: ~3x the open in position, ~3.5–4x out of position, so a size is judged against what its position normally uses.
        const typical = reraise.inPosition ? 3 : 3.8;
        const sizeFactor = reraise.ratio <= typical * 0.75 ? 1.4 : reraise.ratio >= typical * 1.2 ? 0.85 : 1;
        range = Math.min(seated <= 2 ? 0.45 : 0.3, base * Math.min(seated <= 2 ? 3 : 2, tableWidth) * sizeFactor * (profile.known && profile.vpip > 0.45 ? 1.3 : 1));
        // A player who re-raises a lot holds a range about as wide as how often he does it.
        if (profile.known && profile.reraise >= 0.18) range = Math.max(range, Math.min(0.85, profile.reraise));
      }
      if (player.seat === hand.big_blind_seat && preflopRaises(hand).count === 0) range = 1;
      const bets = lineWeight.get(player.id) || 0;
      let boardMin = 0;
      if (bets) {
        const tight = profile.vpip < 0.22;
        const passive = profile.aggression < 0.8;
        const wild = profile.aggression > 2;
        // The starting-hand range narrows only a little (the board does the rest): a bet means he has hit it.
        const perBet = tight || passive ? 0.6 : wild ? 1 : 0.8;
        range *= perBet ** bets;
        // 1 bet: better than ~30% of hands on this board; a raise or several bets: ~50-75%. A tight or passive player
        // bets with more; a maniac bets with anything.
        const styleFactor = tight || passive ? 1.25 : wild ? 0.6 : 1;
        const preflopRaiser = raisers.has(player.id);
        const fit = preflopRaiser ? (highBoard ? 0.85 : lowBoard ? 1.05 : 1) : (highBoard ? 1.1 : lowBoard ? 0.95 : 1);
        boardMin = Math.min(0.9, (1 - 0.7 ** bets) * styleFactor * fit);
      }
      return { range: Math.max(0.02, range), boardMin };
    });
};

// ---------- Decisions ----------
/**
 * A hidden playing style for every bot (owner, 2026-10-05): the ranges it plays are 10–15% wider or narrower than the
 * baseline. It comes from the bot's random id, which is new every time a bot is added, so a style cannot be learned from
 * a name and the same name has a different character the next time.
 */
export const botStyle = (id: string) => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) { hash ^= id.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return 0.86 + 0.28 * (((hash >>> 0) % 10000) / 10000);
};

const preflopDecision = (hand: PokerState, bot: PokerPlayer, random: () => number, riskPremium = 0, looseness = 1): PokerBotAction => {
  // ICM pressure narrows every calling and shoving range.
  const tighten = 1 - Math.min(0.6, riskPremium * 3);
  const hole = hand.hole_cards[bot.id] || [];
  const cls = handClass(hole);
  const pct = handPercentile(hole);
  const bb = hand.big_blind;
  const toCall = Math.max(0, hand.current_bet - bot.committed);
  const stackBb = (bot.chips + bot.committed) / bb;
  const tableSize = hand.players.length;
  const behind = playersBehind(hand, bot);
  const style = botStyle(bot.id) * looseness;
  const { count: raises } = preflopRaises(hand);

  // Facing an all-in (or a bet that takes most of the stack) before the flop (owner, 2026-10-07: «push any two» was
  // folded to). No more betting follows, so the whole equity counts: call when it beats the price against the range he
  // shoves — measured from how often he does it. Against «any two» that is roughly A2+, K5+, Q8+, J9+ and every pair at
  // 50 big blinds; against a regular's rare shove only the top hands.
  const lastAggressor = preflopRaises(hand).lastRaiserId;
  const shover = lastAggressor ? hand.players.find((player) => player.id === lastAggressor) : null;
  if (toCall > 0 && shover && (shover.all_in || toCall >= bot.chips * 0.6)) {
    const profile = pokerOpponentProfile(shover.id);
    const shoveRange = profile.known ? Math.min(1, Math.max(0.04, profile.shove * 1.1)) : raises >= 2 ? 0.05 : 0.08;
    const equity = estimateEquity(hole, [], [shoveRange], random, 400, 40);
    const price = Math.min(toCall, bot.chips);
    const needed = price / (hand.pot + price) + riskPremium;
    if (equity >= needed) return { type: 'call' };
    return passive(toCall);
  }

  // Short stack: push or fold under 12 big blinds — and tight (owner, 2026-10-07): the last chips go in only with a strong
  // hand, not with any push/fold-chart hand (`style` already carries the short stack's caution).
  if (stackBb <= 12) {
    const shove = (raises === 0 ? Math.min(0.5, openRange(behind, tableSize) * style) : 0.06) * tighten;
    if (pct <= shove) return { type: 'all_in' };
    return passive(toCall);
  }

  if (raises === 0) {
    const limpers = preflopActions(hand).filter((entry) => entry.type === 'call').length;
    if (inMixedRange(pct, openRange(behind, tableSize) * style, random)) {
      return raiseTo(hand, bot, bb * (behind <= 2 ? 2.5 : 2.2) + limpers * bb);
    }
    // Big blind with no raise: a free look at the flop.
    return passive(toCall);
  }

  const { lastRaiserId } = preflopRaises(hand);
  const raiser = hand.players.find((player) => player.id === lastRaiserId);
  const raiserProfile = lastRaiserId ? pokerOpponentProfile(lastRaiserId) : null;
  // A player who raises a lot (a maniac) is re-raised and called wider: most of his hands are weak.
  const frequentRaiser = Boolean(raiserProfile?.known && raiserProfile.pfr > 0.35);
  if (raises === 1) {
    const callers = preflopActions(hand).filter((entry) => entry.type === 'call').length;
    const valueThreeBet = (behind <= 1 ? 0.07 : 0.05) * style * (frequentRaiser ? 2.2 : 1);
    if (pct <= valueThreeBet || (isBluff3Bet(cls) && random() < 0.35)) {
      return raiseTo(hand, bot, hand.current_bet * (behind <= 1 ? 3.6 : 3));
    }
    const defend = defendRange(hand, bot, raiser?.seat ?? hand.dealer_seat, lastRaiserId, callers);
    // Never call off a big part of the stack with a marginal hand: only a price the stack can bear.
    if (pct <= defend * style * tighten && toCall <= (bot.chips + bot.committed) * 0.3) return { type: 'call' };
    return passive(toCall);
  }

  // Facing a re-raise (owner, 2026-10-07: judge the spot, the player and the size, not a fixed chart). His re-raising range
  // is as wide as how often he re-raises (measured; a regular's 8% while there is little data), whatever the size: a novice's
  // small re-raise is often a strong hand, a maniac's is anything — his own numbers tell which. The bot's equity against that range — discounted out of position, where an aggressive player keeps
  // betting — is compared with the price: a cheap re-raise is called with most playable hands, an expensive one from a tight
  // player still folds all but strong hands.
  const levels = preflopBetLevels(hand);
  const ratio = levels.length >= 2 ? levels[levels.length - 1] / Math.max(bb, levels[levels.length - 2]) : 3;
  // A small re-raise is cheap but not weak (novices make it with strong hands): only a big one narrows the range.
  const sizeFactor = ratio >= 4 ? 0.8 : 1;
  const reraiseRate = raiserProfile?.reraise ?? 0.08;
  const range = Math.min(0.85, Math.max(0.025, reraiseRate * sizeFactor * (raises >= 3 ? 0.5 : 1)));
  const equity = estimateEquity(hole, [], [range], random, 260, 40);
  const inPosition = Boolean(raiser) && openerLateness(hand, bot.seat) > openerLateness(hand, raiser!.seat);
  const realized = equity * (inPosition ? 0.88 : 0.72) * (style >= 1 ? 1.02 : 0.98);
  const price = Math.min(toCall, bot.chips);
  const needed = price / (hand.pot + price) + riskPremium;
  // Re-raise back when well ahead of his range (a 4-bet or more needs a premium hand).
  if ((raises === 2 ? equity >= 0.6 : pct <= 0.025) && bot.chips > toCall) return raiseTo(hand, bot, hand.current_bet * 2.4);
  // Calling a big part of the stack needs a real edge, not a coin flip.
  const stackShare = price / Math.max(1, bot.chips + bot.committed);
  if (realized * tighten >= needed + (stackShare > 0.35 ? 0.08 : 0)) return { type: 'call' };
  return passive(toCall);
};

type Candidate = { action: PokerBotAction; ev: number };

/**
 * After the flop the bot compares the expected value (in chips) of every option and plays the best one,
 * with a little mixing between close options so it cannot be read:
 * - fold = 0, call = equity × final pot − price;
 * - bet or raise = fold equity × pot + (1 − fold equity) × (equity when called × final pot − size).
 * Fold equity comes from the opponent's measured «fold to bet» and grows with the bet size;
 * when called, the bot's equity drops because the caller's range is stronger.
 */
const postflopDecision = (hand: PokerState, bot: PokerPlayer, random: () => number, riskPremium: number): PokerBotAction => {
  const hole = hand.hole_cards[bot.id] || [];
  const toCall = Math.max(0, hand.current_bet - bot.committed);
  const ranges = opponentRanges(hand, bot);
  if (!ranges.length) return passive(toCall);
  const equity = estimateEquity(hole, hand.board, ranges, random);
  const pot = hand.pot;
  const river = hand.street === 'river';
  const opponentsLeft = ranges.length;
  const opponentProfiles = hand.players.filter((player) => player.id !== bot.id && !player.folded).map((player) => pokerOpponentProfile(player.id));
  const stack = bot.chips;
  // Draws keep some value for later streets (implied odds); none on the river.
  // The equity from the simulation already counts the cards to come (draws included); a hand never realises all of it
  // — it has to pay again on later streets and is often out of position — so before the river it is discounted.
  const realized = river ? equity : equity * 0.93;
  // In a tournament (ICM) chips lost hurt more than chips won help: a risk premium raises the bar.
  const needed = (price: number, finalPot: number) => price / finalPot + riskPremium;

  // The player who raised before the flop holds the initiative: his continuation bet is believed more often than a
  // bet from nowhere, because the opponents' ranges mostly missed the flop.
  const hasInitiative = hand.street === 'flop' && toCall === 0 && opponentsLeft <= 2 && preflopRaises(hand).lastRaiserId === bot.id;
  // The story of the hand (owner, 2026-10-05): on a dry high-card flop (A or K high, like K-2-3) the preflop raiser and a
  // blind that defended can represent the king without holding it, and a card of that rank in the bot's hand blocks the
  // calls. The semi-bluffs with flush and straight draws already come from the simulated equity; this adds the pure bluffs.
  const flopCards = hand.board.slice(0, 3);
  const topValue = Math.max(0, ...flopCards.map((card) => value(card.rank)));
  const flopPaired = new Set(flopCards.map((card) => card.rank)).size < flopCards.length;
  const flushish = ['spades', 'hearts', 'diamonds', 'clubs'].some((suit) => flopCards.filter((card) => card.suit === suit).length >= 2);
  const flopValues = flopCards.map((card) => value(card.rank)).sort((a, b) => a - b);
  const coordinated = flopValues.length === 3 && flopValues[2] - flopValues[0] <= 4;
  const dryHighFlop = flopCards.length === 3 && topValue >= 13 && !flushish && !coordinated;
  const representsRange = bot.seat === hand.small_blind_seat || bot.seat === hand.big_blind_seat || preflopRaises(hand).raisers.has(bot.id);
  const blocksTop = hole.some((card) => value(card.rank) === topValue);
  const botBetFlop = hand.action_log.some((entry) => entry.street === 'flop' && entry.player_id === bot.id && (entry.type === 'bet' || entry.type === 'raise'));
  const story = toCall === 0 && !river && opponentsLeft <= 2 && dryHighFlop && representsRange && (hand.street === 'flop' || botBetFlop)
    ? (flopPaired ? 0.05 : 0.1) * (hand.street === 'flop' ? 1 : 0.6) + (blocksTop ? 0.04 : 0)
    : 0;
  const candidates: Candidate[] = [];
  if (toCall === 0) candidates.push({ action: { type: 'check' }, ev: realized * pot * (river ? 1 : 0.92) });
  else {
    candidates.push({ action: { type: 'fold' }, ev: 0 });
    const price = Math.min(toCall, stack);
    const finalPot = pot + price;
    candidates.push({ action: { type: 'call' }, ev: realized >= needed(price, finalPot) - 0.02 - (botStyle(bot.id) - 1) * 0.1 ? realized * finalPot - price : -price });
  }

  const sizes = toCall === 0 ? [0.33, 0.66, 1] : [2.5, 3.5];
  for (const size of sizes) {
    const total = toCall === 0 ? bot.committed + pot * size : hand.current_bet * size;
    const put = Math.min(stack, Math.max(0, total - bot.committed));
    if (put <= toCall || put <= 0) continue;
    const ratio = put / Math.max(1, pot);
    // Opponents fold more to bigger bets; several opponents fold together less often.
    // A player who has just bet folds to a raise much less often than to a bet.
    const versusBettor = toCall > 0 ? 0.55 : 1;
    const sizeFactor = Math.sqrt(Math.min(2, ratio) / 0.66);
    // Every opponent must fold, each by his own profile (not the first one's profile for all).
    const foldEquity = opponentProfiles.reduce((all, other) => all * Math.min(0.85, (other.foldToBet + (hasInitiative ? 0.12 : 0) + story) * versusBettor * sizeFactor), 1);
    // A raise over a bet is called by the stronger part of the range: the caller's equity drops more than for a bet.
    const calledEquity = Math.max(0, realized - (toCall > 0 ? (river ? 0.3 : 0.18) : 0.1) * Math.min(1.5, ratio));
    const finalPot = pot + put * (1 + Math.min(1, opponentsLeft));
    const ev = foldEquity * pot + (1 - foldEquity) * (calledEquity * finalPot - put) - riskPremium * put;
    candidates.push({ action: raiseTo(hand, bot, bot.committed + put), ev });
  }

  candidates.sort((a, b) => b.ev - a.ev);
  // Mixed strategy: a close second option is played sometimes (within 5% of the pot).
  const best = candidates[0];
  const second = candidates[1];
  if (second && best.ev - second.ev < pot * 0.05 && random() < 0.3) return second.action;
  return best.action;
};

/**
 * The bot's own stack and the fear of leaving the table (owner, 2026-10-07: bots shoved too often). Measured in big blinds
 * against a bot's buy-in of 50 big blinds: a short stack plays ultra-tight and needs a real edge before risking its chips,
 * a deep stack plays looser. `looseness` scales every starting-hand range; `premium` is the extra equity a call needs and
 * the share of each chip put in that a bet must earn back (the same mechanism the tournament ICM uses).
 */
export const BOT_BUY_IN_BB = 50;
export const stackPressure = (hand: PokerState, bot: PokerPlayer) => {
  const depth = (bot.chips + bot.committed) / Math.max(1, hand.big_blind) / BOT_BUY_IN_BB;
  const looseness = depth <= 0.3 ? 0.6 : depth < 1 ? 0.6 + 0.4 * (depth - 0.3) / 0.7 : Math.min(1.25, 1 + 0.25 * (depth - 1) / 1.5);
  const premium = depth <= 0.3 ? 0.06 : depth < 1 ? 0.06 - 0.04 * (depth - 0.3) / 0.7 : Math.max(0, 0.02 - 0.02 * (depth - 1) / 1.5);
  return { depth, looseness, premium };
};

/** The bot's move for the current turn. Always a legal action for the engine. */
export const chooseStrongBotAction = (hand: PokerState, bot: PokerPlayer, random = Math.random, options: { payouts?: number[] } = {}): PokerBotAction => {
  const toCall = Math.max(0, hand.current_bet - bot.committed);
  // Tournaments add the ICM premium; at the cash table the bot's own stack sets one (fear of busting, see `stackPressure`).
  const pressure = stackPressure(hand, bot);
  const riskPremium = (options.payouts?.length ? icmRiskPremium(hand, bot, options.payouts) : 0) + pressure.premium;
  let action = hand.street === 'preflop' ? preflopDecision(hand, bot, random, riskPremium, pressure.looseness) : postflopDecision(hand, bot, random, riskPremium);
  if (action.type === 'fold' && isCheapCall(hand, bot)) action = { type: 'call' };
  if (action.type === 'bet' && (bot.chips <= toCall || (action.amount || 0) <= hand.current_bet)) action = toCall ? { type: 'call' } : { type: 'check' };
  if (action.type === 'call' && toCall === 0) action = { type: 'check' };
  if (action.type === 'check' && toCall > 0) action = { type: 'fold' };
  return action;
};

// ---------- ICM (for future tournaments) ----------
/** Malmuth–Harville: each player's share of the prize pool from the stacks. */
export const icmEquity = (stacks: number[], payouts: number[]): number[] => {
  const total = stacks.reduce((sum, stack) => sum + stack, 0);
  const result = stacks.map(() => 0);
  if (total <= 0) return result;
  const walk = (remaining: number[], place: number, probability: number) => {
    if (place >= payouts.length || probability === 0) return;
    const left = remaining.reduce((sum, index) => sum + stacks[index], 0);
    if (left <= 0) return;
    for (const index of remaining) {
      const chance = probability * (stacks[index] / left);
      result[index] += chance * payouts[place];
      walk(remaining.filter((other) => other !== index), place + 1, chance);
    }
  };
  walk(stacks.map((_, index) => index).filter((index) => stacks[index] > 0), 0, 1);
  return result;
};

/**
 * How much extra equity the bot needs because losing chips costs more prize money than winning them gives:
 * compares the ICM loss of busting this pot with the ICM gain of winning it.
 */
export const icmRiskPremium = (hand: PokerState, bot: PokerPlayer, payouts: number[]) => {
  const stacks = hand.players.map((player) => player.chips + player.committed);
  const index = hand.players.findIndex((player) => player.id === bot.id);
  if (index < 0 || stacks.length > 9) return 0;
  const now = icmEquity(stacks, payouts)[index];
  const risk = Math.min(stacks[index], ...stacks.filter((_, i) => i !== index));
  const win = stacks.slice(); const lose = stacks.slice();
  win[index] += risk; lose[index] -= risk;
  const others = stacks.map((_, i) => i).filter((i) => i !== index);
  const victim = others.sort((a, b) => stacks[b] - stacks[a])[0];
  win[victim] -= risk; lose[victim] += risk;
  const gain = icmEquity(win, payouts)[index] - now;
  const loss = now - icmEquity(lose, payouts)[index];
  if (gain + loss <= 0) return 0;
  // Chip EV needs 50%; ICM needs loss / (gain + loss). The difference is the premium.
  return Math.max(0, loss / (gain + loss) - 0.5);
};
