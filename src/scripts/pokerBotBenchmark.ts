/**
 * Measures how strong the poker bots are: plays many hands of a bot against simple opponents and reports the bot's
 * result in big blinds per 100 hands (positive = the bot wins). Run: `npx tsx src/scripts/pokerBotBenchmark.ts [hands]`.
 * Opponents are deliberately crude — results against these scripts are diagnostic, not proof of GTO or profitability against real players.
 * Add --learn --continuous for persistent profiles and changing stacks (busted seats receive a fresh buy-in).
 * POKER_BENCHMARK_SEED fixes both cards and policy randomness; default 123.
 */
import { applyPokerAction, createDeck, createPokerHand, minRaiseTotal, type PokerState } from '../server/services/pokerEngine.ts';
import { chooseStrongBotAction, handPercentile, observePokerHand, resetPokerBotMemoryForTests, type PokerBotAction } from '../server/services/pokerBot.ts';

type Strategy = (hand: PokerState, playerId: string, random: () => number) => PokerBotAction;
const STACK = 2000;
const BB = 20;

const toCallOf = (hand: PokerState, playerId: string) => {
  const player = hand.players.find((item) => item.id === playerId)!;
  return Math.max(0, hand.current_bet - player.committed);
};
const rank = (hand: PokerState, playerId: string) => handPercentile(hand.hole_cards[playerId] || []);

/** Calls everything, never raises: the classic play-money «calling station». */
const station: Strategy = (hand, id) => (toCallOf(hand, id) > 0 ? { type: 'call' } : { type: 'check' });
/** Raises to the size of the pot with every hand. */
const maniac: Strategy = (hand) => ({ type: 'bet', amount: hand.current_bet + Math.max(hand.pot, minRaiseTotal(hand) - hand.current_bet) });
/** Plays only the top hands and folds to any aggression afterwards. */
const nit: Strategy = (hand, id) => {
  const toCall = toCallOf(hand, id);
  if (hand.street === 'preflop') return rank(hand, id) <= 0.1 ? (toCall > hand.big_blind * 3 ? { type: 'call' } : { type: 'bet', amount: hand.current_bet * 3 }) : toCall ? { type: 'fold' } : { type: 'check' };
  return toCall ? { type: 'fold' } : { type: 'check' };
};
/** Plays about half of the hands, calls bets, raises now and then: a typical loose recreational player. */
const loose: Strategy = (hand, id, random) => {
  const toCall = toCallOf(hand, id);
  const pct = rank(hand, id);
  if (hand.street === 'preflop') {
    if (pct <= 0.12 && random() < 0.6) return { type: 'bet', amount: Math.max(hand.current_bet * 2.5, hand.big_blind * 3) };
    return pct <= 0.5 ? (toCall ? { type: 'call' } : { type: 'check' }) : toCall ? { type: 'fold' } : { type: 'check' };
  }
  if (random() < 0.12) return { type: 'bet', amount: hand.current_bet + hand.pot * 0.6 };
  if (toCall && random() < 0.3) return { type: 'fold' };
  return toCall ? { type: 'call' } : { type: 'check' };
};
const bot: Strategy = (hand, id, random) => chooseStrongBotAction(hand, hand.players.find((item) => item.id === id)!, random);
export const STRATEGIES: Record<string, Strategy> = { station, maniac, nit, loose, bot };

const play = (hand: PokerState, strategies: Map<string, Strategy>, random: () => number) => {
  let guard = 0;
  while (hand.street !== 'finished' && hand.street !== 'showdown' && guard++ < 400) {
    const current = hand.players.find((item) => item.seat === hand.current_seat);
    if (!current) break;
    const strategy = strategies.get(current.id)!;
    let action = strategy(hand, current.id, random);
    try { applyPokerAction(hand, action); } catch {
      const toCall = toCallOf(hand, current.id);
      action = toCall ? { type: 'call' } : { type: 'check' };
      applyPokerAction(hand, action);
    }
  }
};

/** The bot against `opponents`; returns the bot's big blinds per 100 hands. */
export const benchmark = (opponentNames: string[], hands: number, options: { seed?: number; learn?: boolean; continuous?: boolean; stack?: number } = {}) => {
  let seed = options.seed ?? 123;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const stack = options.stack ?? STACK;
  resetPokerBotMemoryForTests();
  const seats = [{ id: 'bot', strategy: bot }, ...opponentNames.map((name, index) => ({ id: `opp${index}`, strategy: STRATEGIES[name] }))];
  const strategies = new Map(seats.map((seat) => [seat.id, seat.strategy]));
  let net = 0;
  const stacks = new Map(seats.map((seat) => [seat.id, stack]));
  for (let index = 0; index < hands; index += 1) {
    const players = seats.map((seat, i) => ({ id: seat.id, nickname: seat.id, seat: i + 1, chips: options.continuous ? stacks.get(seat.id)! : stack, is_bot: seat.id === 'bot' }));
    const deck = createDeck();
    for (let i = deck.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const hand = createPokerHand({ deck, id: `h${index}`, players, dealer_seat: (index % seats.length) + 1, small_blind: BB / 2, big_blind: BB });
    play(hand, strategies, random);
    if (!['finished', 'showdown'].includes(hand.street)) throw new Error(`Unfinished benchmark hand ${hand.id}`);
    if (options.learn) observePokerHand(hand);
    for (const player of hand.players) stacks.set(player.id, player.chips > 0 ? player.chips : stack);
    const me = hand.players.find((player) => player.id === 'bot')!;
    net += me.chips - (me.start_chips ?? stack);
  }
  return (net / BB / hands) * 100;
};

if (process.argv[1]?.endsWith('pokerBotBenchmark.ts')) {
  const hands = Number(process.argv[2]) || 1500;
  const matchups: string[][] = [['station'], ['maniac'], ['nit'], ['loose'], ['bot'], ['station', 'station', 'station', 'station', 'station'], ['maniac', 'loose', 'station', 'loose', 'maniac'], ['loose', 'loose', 'loose', 'loose', 'loose']];
  for (const opponents of matchups) {
    const started = Date.now();
    const result = benchmark(opponents, hands, { seed: Number(process.env.POKER_BENCHMARK_SEED) || 123, learn: process.argv.includes('--learn'), continuous: process.argv.includes('--continuous'), stack: process.argv.includes('--continuous') ? 1000 : STACK });
    console.log(`${opponents.length === 1 ? 'heads-up' : '6-max'} vs ${opponents.join('+')}: ${result.toFixed(1)} bb/100 over ${hands} hands (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
}
