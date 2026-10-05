/**
 * Measures how strong the poker bots are: plays many hands of a bot against simple opponents and reports the bot's
 * result in big blinds per 100 hands (positive = the bot wins). Run: `npx tsx src/scripts/pokerBotBenchmark.ts [hands]`.
 * Opponents are deliberately crude — a strong bot must beat every one of them, because real players at the club
 * are loose, passive or aggressive in just these ways.
 */
import { applyPokerAction, createPokerHand, minRaiseTotal, type PokerState } from '../server/services/pokerEngine.ts';
import { chooseStrongBotAction, handPercentile, resetPokerBotMemoryForTests, type PokerBotAction } from '../server/services/pokerBot.ts';

type Strategy = (hand: PokerState, playerId: string) => PokerBotAction;
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
const loose: Strategy = (hand, id) => {
  const toCall = toCallOf(hand, id);
  const pct = rank(hand, id);
  if (hand.street === 'preflop') {
    if (pct <= 0.12 && Math.random() < 0.6) return { type: 'bet', amount: Math.max(hand.current_bet * 2.5, hand.big_blind * 3) };
    return pct <= 0.5 ? (toCall ? { type: 'call' } : { type: 'check' }) : toCall ? { type: 'fold' } : { type: 'check' };
  }
  if (Math.random() < 0.12) return { type: 'bet', amount: hand.current_bet + hand.pot * 0.6 };
  if (toCall && Math.random() < 0.3) return { type: 'fold' };
  return toCall ? { type: 'call' } : { type: 'check' };
};
const bot: Strategy = (hand, id) => chooseStrongBotAction(hand, hand.players.find((item) => item.id === id)!);
export const STRATEGIES: Record<string, Strategy> = { station, maniac, nit, loose, bot };

const play = (hand: PokerState, strategies: Map<string, Strategy>) => {
  let guard = 0;
  while (hand.street !== 'finished' && hand.street !== 'showdown' && guard++ < 400) {
    const current = hand.players.find((item) => item.seat === hand.current_seat);
    if (!current) break;
    const strategy = strategies.get(current.id)!;
    let action = strategy(hand, current.id);
    try { applyPokerAction(hand, action); } catch {
      const toCall = toCallOf(hand, current.id);
      action = toCall ? { type: 'call' } : { type: 'check' };
      applyPokerAction(hand, action);
    }
  }
};

/** The bot against `opponents`; returns the bot's big blinds per 100 hands. */
export const benchmark = (opponentNames: string[], hands: number) => {
  resetPokerBotMemoryForTests();
  const seats = [{ id: 'bot', strategy: bot }, ...opponentNames.map((name, index) => ({ id: `opp${index}`, strategy: STRATEGIES[name] }))];
  const strategies = new Map(seats.map((seat) => [seat.id, seat.strategy]));
  let net = 0;
  for (let index = 0; index < hands; index += 1) {
    const players = seats.map((seat, i) => ({ id: seat.id, nickname: seat.id, seat: i + 1, chips: STACK, is_bot: seat.id === 'bot' }));
    const hand = createPokerHand({ id: `h${index}`, players, dealer_seat: (index % seats.length) + 1, small_blind: BB / 2, big_blind: BB });
    play(hand, strategies);
    const me = hand.players.find((player) => player.id === 'bot')!;
    net += me.chips - (me.start_chips ?? STACK);
  }
  return (net / BB / hands) * 100;
};

if (process.argv[1]?.endsWith('pokerBotBenchmark.ts')) {
  const hands = Number(process.argv[2]) || 1500;
  const matchups: string[][] = [['station'], ['maniac'], ['nit'], ['loose'], ['bot'], ['station', 'station', 'station', 'station', 'station'], ['maniac', 'loose', 'station', 'loose', 'maniac'], ['loose', 'loose', 'loose', 'loose', 'loose']];
  for (const opponents of matchups) {
    const started = Date.now();
    const result = benchmark(opponents, hands);
    console.log(`${opponents.length === 1 ? 'heads-up' : '6-max'} vs ${opponents.join('+')}: ${result.toFixed(1)} bb/100 over ${hands} hands (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
}
