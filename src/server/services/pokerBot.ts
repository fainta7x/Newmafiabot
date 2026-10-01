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
type OpponentStats = { hands: number; vpip: number; pfr: number; facedBet: number; foldedToBet: number; postflopAggro: number; postflopPassive: number };
const opponents = new Map<string, OpponentStats>();
const blankStats = (): OpponentStats => ({ hands: 0, vpip: 0, pfr: 0, facedBet: 0, foldedToBet: 0, postflopAggro: 0, postflopPassive: 0 });

/** Called once per finished hand: what every human (and bot) did, for the bots to adapt. */
export const observePokerHand = (hand: PokerState) => {
  const seen = new Set<string>();
  const voluntary = new Set<string>();
  const raisedPre = new Set<string>();
  const betOnStreet = new Map<string, boolean>();
  for (const entry of hand.action_log) {
    seen.add(entry.player_id);
    const stats = opponents.get(entry.player_id) || blankStats();
    opponents.set(entry.player_id, stats);
    if (entry.street === 'preflop') {
      if (entry.type === 'call' || entry.type === 'raise' || entry.type === 'bet' || entry.type === 'all_in') voluntary.add(entry.player_id);
      if (entry.type === 'raise' || entry.type === 'bet' || entry.type === 'all_in') raisedPre.add(entry.player_id);
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
    const stats = opponents.get(player.id)!;
    stats.hands += 1;
    if (voluntary.has(player.id)) stats.vpip += 1;
    if (raisedPre.has(player.id)) stats.pfr += 1;
  }
};

/**
 * Population priors from public poker statistics (typical small-stakes regulars and recreational
 * players): about 25% of hands played, about 45% folds to a continuation bet, aggression near 1.
 * Each player's own numbers replace the priors gradually (the prior counts as 10 hands / 10 spots).
 */
const PRIOR = { vpip: 0.25, foldToBet: 0.45, aggression: 1, weight: 10 };

export const pokerOpponentProfile = (playerId: string) => {
  const stats = opponents.get(playerId);
  if (!stats) return { known: false, vpip: PRIOR.vpip, foldToBet: PRIOR.foldToBet, aggression: PRIOR.aggression };
  const w = PRIOR.weight;
  return {
    known: stats.hands >= 8,
    vpip: (stats.vpip + PRIOR.vpip * w) / (stats.hands + w),
    foldToBet: (stats.foldedToBet + PRIOR.foldToBet * w) / (stats.facedBet + w),
    aggression: (stats.postflopAggro + PRIOR.aggression * w) / (stats.postflopPassive + w),
  };
};

export const resetPokerBotMemoryForTests = () => opponents.clear();

// ---------- Helpers ----------
const cardKey = (card: PokerCard) => `${card.rank}${card.suit}`;

const preflopActions = (hand: PokerState) => hand.action_log.filter((entry) => entry.street === 'preflop' && entry.type !== 'small_blind' && entry.type !== 'big_blind');

/** How many raises were made before the flop, and who made the last one. */
const preflopRaises = (hand: PokerState) => {
  const raises = preflopActions(hand).filter((entry) => entry.type === 'raise' || entry.type === 'bet' || (entry.type === 'all_in' && entry.amount > 0));
  return { count: raises.length, lastRaiserId: raises.at(-1)?.player_id || null, raisers: new Set(raises.map((entry) => entry.player_id)) };
};

/** Players still to act after the bot before the flop (blinds included): fewer means a later position. */
const playersBehind = (hand: PokerState, bot: PokerPlayer) => {
  const ordered = hand.players.filter((player) => !player.folded).sort((a, b) => a.seat - b.seat);
  const bbIndex = ordered.findIndex((player) => player.seat === hand.big_blind_seat);
  const botIndex = ordered.findIndex((player) => player.id === bot.id);
  if (bbIndex < 0 || botIndex < 0) return 3;
  return (bbIndex - botIndex + ordered.length) % ordered.length;
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

/** Monte Carlo equity against opponents whose hands are limited to what their actions suggest. */
export const estimateEquity = (hole: PokerCard[], board: PokerCard[], opponentRanges: number[], random = Math.random, iterations = 0) => {
  const used = new Set([...hole, ...board].map(cardKey));
  const deck = createDeck().filter((card) => !used.has(cardKey(card)));
  const runs = iterations || Math.max(120, Math.round(480 / (opponentRanges.length + 1)));
  let score = 0;
  for (let run = 0; run < runs; run += 1) {
    const pool = deck.slice();
    const draw = () => pool.splice(Math.floor(random() * pool.length), 1)[0];
    const hands: PokerCard[][] = [];
    for (const range of opponentRanges) {
      let pick: PokerCard[] = [draw(), draw()];
      // Keep re-drawing while the hand is outside the opponent's likely range (a few tries).
      for (let attempt = 0; attempt < 6 && handPercentile(pick) > range; attempt += 1) {
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
const opponentRanges = (hand: PokerState, bot: PokerPlayer) => {
  const { raisers } = preflopRaises(hand);
  const reraised = preflopRaises(hand).count >= 2;
  // Popular lines (owner, 2026-10-02): a bet after the flop narrows the bettor's range, and how much
  // depends on who bets — a tight or passive player rarely bets or c-bets a weak hand.
  // Strength of each aggressive action, from common reads in poker guides: a raise after the flop
  // (check-raise or raise of a bet) and anything on the river are much stronger than a first flop bet.
  const lineWeight = new Map<string, number>();
  const streetHadBet = new Map<string, boolean>();
  for (const entry of hand.action_log) {
    if (entry.street === 'preflop') continue;
    const aggressive = entry.type === 'bet' || entry.type === 'raise' || (entry.type === 'all_in' && entry.amount > 0);
    if (!aggressive) continue;
    const isRaise = streetHadBet.get(entry.street) || entry.type === 'raise';
    const weight = entry.street === 'river' ? (isRaise ? 2.5 : 1.4) : entry.street === 'turn' ? (isRaise ? 2 : 1.2) : isRaise ? 1.8 : 1;
    lineWeight.set(entry.player_id, (lineWeight.get(entry.player_id) || 0) + weight);
    streetHadBet.set(entry.street, true);
  }
  return hand.players
    .filter((player) => player.id !== bot.id && !player.folded)
    .map((player) => {
      const profile = pokerOpponentProfile(player.id);
      const loose = profile.known ? Math.min(0.7, Math.max(0.12, profile.vpip)) : 0.45;
      let range = raisers.has(player.id) ? (reraised ? 0.08 : Math.min(0.25, loose)) : loose;
      if (player.seat === hand.big_blind_seat && preflopRaises(hand).count === 0) range = 1;
      const bets = lineWeight.get(player.id) || 0;
      if (bets) {
        const tight = profile.vpip < 0.22;
        const passive = profile.aggression < 0.8;
        const wild = profile.aggression > 2;
        const perBet = tight || passive ? 0.45 : wild ? 0.85 : 0.65;
        range *= perBet ** bets;
      }
      return Math.max(0.02, range);
    });
};

// ---------- Decisions ----------
const preflopDecision = (hand: PokerState, bot: PokerPlayer, random: () => number, riskPremium = 0): PokerBotAction => {
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
  const { count: raises } = preflopRaises(hand);

  // Short stack: push or fold, the way push/fold charts play under 12 big blinds.
  if (stackBb <= 12) {
    const shove = (raises === 0 ? Math.min(0.7, openRange(behind, tableSize) * 1.6) : 0.1) * tighten;
    if (pct <= shove) return { type: 'all_in' };
    return passive(toCall);
  }

  if (raises === 0) {
    const limpers = preflopActions(hand).filter((entry) => entry.type === 'call').length;
    if (inMixedRange(pct, openRange(behind, tableSize), random)) {
      return raiseTo(hand, bot, bb * (behind <= 2 ? 2.5 : 2.2) + limpers * bb);
    }
    // Big blind with no raise: a free look at the flop.
    return passive(toCall);
  }

  const potOdds = toCall / (hand.pot + toCall);
  if (raises === 1) {
    const valueThreeBet = behind <= 1 ? 0.07 : 0.05;
    if (pct <= valueThreeBet || (isBluff3Bet(cls) && random() < 0.35)) {
      return raiseTo(hand, bot, hand.current_bet * (behind <= 1 ? 3.6 : 3));
    }
    // Defend wider in the big blind (good price), tighter out of position elsewhere.
    const defend = hand.big_blind_seat === bot.seat ? 0.38 : behind <= 2 ? 0.2 : 0.14;
    if (pct <= defend * tighten && potOdds < 0.4) return { type: 'call' };
    return passive(toCall);
  }

  // Facing a 3-bet or more.
  if (pct <= 0.025 || (cls === 'A5s' && random() < 0.25)) return raiseTo(hand, bot, hand.current_bet * 2.4);
  if (pct <= (raises >= 3 ? 0.03 : 0.07) * tighten && toCall <= bot.chips * 0.35) return { type: 'call' };
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
  const target = hand.players.find((player) => player.id !== bot.id && !player.folded);
  const profile = target ? pokerOpponentProfile(target.id) : pokerOpponentProfile('');
  const stack = bot.chips;
  // Draws keep some value for later streets (implied odds); none on the river.
  const realized = river ? equity : Math.min(1, equity + (equity > 0.3 && equity < 0.55 ? 0.05 : 0));
  // In a tournament (ICM) chips lost hurt more than chips won help: a risk premium raises the bar.
  const needed = (price: number, finalPot: number) => price / finalPot + riskPremium;

  const candidates: Candidate[] = [];
  if (toCall === 0) candidates.push({ action: { type: 'check' }, ev: realized * pot * (river ? 1 : 0.92) });
  else {
    candidates.push({ action: { type: 'fold' }, ev: 0 });
    const price = Math.min(toCall, stack);
    const finalPot = pot + price;
    candidates.push({ action: { type: 'call' }, ev: realized >= needed(price, finalPot) - 0.02 ? realized * finalPot - price : -price });
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
    const foldEquity = Math.min(0.85, profile.foldToBet * versusBettor * Math.sqrt(Math.min(2, ratio) / 0.66)) ** opponentsLeft;
    const calledEquity = Math.max(0, realized - 0.1 * Math.min(1.5, ratio));
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

/** The bot's move for the current turn. Always a legal action for the engine. */
export const chooseStrongBotAction = (hand: PokerState, bot: PokerPlayer, random = Math.random, options: { payouts?: number[] } = {}): PokerBotAction => {
  const toCall = Math.max(0, hand.current_bet - bot.committed);
  // Cash games (today): chips are money, no risk premium. Tournaments (later): ICM sets one.
  const riskPremium = options.payouts?.length ? icmRiskPremium(hand, bot, options.payouts) : 0;
  let action = hand.street === 'preflop' ? preflopDecision(hand, bot, random, riskPremium) : postflopDecision(hand, bot, random, riskPremium);
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
