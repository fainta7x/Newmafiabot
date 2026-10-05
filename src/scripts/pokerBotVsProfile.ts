/**
 * Bots against a «double» of a real player: a tight opponent (opens medium-strong hands, value-bets made hands and bluffs
 * in some 15–20% of spots, as the club owner describes his own play). Every deal is played with the double in every seat (the same cards), for the
 * current bot and for a baseline from a git ref. The result is the double's win rate against the bots in big blinds per
 * 100 hands (negative = the bots beat him).
 *
 *   npx tsx src/scripts/pokerBotVsProfile.ts [--ref <git ref>] [--deals N] [--bots N] [--open 18 --play 26 --bluff 17]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyPokerAction, createPokerHand, minRaiseTotal, pokerHandRank, shuffleDeck, type PokerState } from '../server/services/pokerEngine.ts';
import { handPercentile, type PokerBotAction } from '../server/services/pokerBot.ts';

const STACK = 2000;
const BB = 20;
type Choose = (hand: PokerState, player: PokerState['players'][number]) => PokerBotAction;
const argument = (name: string, fallback: number) => { const index = process.argv.indexOf(name); return index >= 0 ? Number(process.argv[index + 1]) : fallback; };

/** Frequencies of the double, in percent: the share of hands he opens, the share he plays at all, and how often he turns a hand into a bluff. */
const profile = { open: argument('--open', 18) / 100, play: argument('--play', 26) / 100, bluff: argument('--bluff', 17) / 100 };

/** A tight player: opens medium-strong hands, bets his made hands for value after the flop and bluffs in some 15–20% of spots. */
const double: Choose = (hand, player) => {
  const toCall = Math.max(0, hand.current_bet - player.committed);
  const hole = hand.hole_cards[player.id] || [];
  const pct = handPercentile(hole);
  if (hand.street === 'preflop') {
    if (hand.current_bet <= hand.big_blind) return pct <= profile.open ? { type: 'bet', amount: hand.big_blind * 3 } : toCall ? (pct <= profile.play ? { type: 'call' } : { type: 'fold' }) : { type: 'check' };
    if (pct <= 0.05) return { type: 'bet', amount: hand.current_bet * 3 };
    return pct <= Math.min(profile.play, 0.16) && toCall <= hand.big_blind * 8 ? { type: 'call' } : toCall ? { type: 'fold' } : { type: 'check' };
  }
  const kind = pokerHandRank([...hole, ...hand.board])[0];
  const roll = Math.random();
  const size = Math.max(hand.big_blind, hand.pot * 0.6);
  if (!toCall) {
    if (kind >= 2) return roll < 0.75 ? { type: 'bet', amount: hand.current_bet + size } : { type: 'check' };
    if (kind === 1) return roll < 0.4 ? { type: 'bet', amount: hand.current_bet + size } : { type: 'check' };
    return roll < profile.bluff ? { type: 'bet', amount: hand.current_bet + size } : { type: 'check' };
  }
  if (kind >= 3 && roll < 0.2) return { type: 'bet', amount: Math.max(minRaiseTotal(hand), hand.current_bet * 2.5) };
  if (kind >= 2) return { type: 'call' };
  if (kind === 1) return roll < 0.65 ? { type: 'call' } : { type: 'fold' };
  return roll < 0.1 ? { type: 'call' } : { type: 'fold' };
};

const play = (botIds: string[], doubleSeat: number, size: number, deck: ReturnType<typeof shuffleDeck>, dealIndex: number, bot: Choose) => {
  const ids = Array.from({ length: size }, (_, index) => (index === doubleSeat ? 'double' : botIds[index > doubleSeat ? index - 1 : index]));
  const players = ids.map((id, index) => ({ id, nickname: id, seat: index + 1, chips: STACK, is_bot: id !== 'double' }));
  const hand = createPokerHand({ id: `d${dealIndex}`, players, dealer_seat: (dealIndex % size) + 1, small_blind: BB / 2, big_blind: BB, deck });
  let guard = 0;
  while (hand.street !== 'finished' && hand.street !== 'showdown' && guard++ < 400) {
    const current = hand.players.find((player) => player.seat === hand.current_seat);
    if (!current) break;
    try { applyPokerAction(hand, current.id === 'double' ? double(hand, current) : bot(hand, current)); } catch {
      applyPokerAction(hand, Math.max(0, hand.current_bet - current.committed) ? { type: 'call' } : { type: 'check' });
    }
  }
  const me = hand.players.find((player) => player.id === 'double')!;
  return me.chips - (me.start_chips ?? STACK);
};

const measure = (label: string, bot: Choose, reset: () => void, size: number, deals: number) => {
  reset();
  const botIds = Array.from({ length: size - 1 }, (_, index) => `bot${index}`);
  const results: number[] = [];
  for (let deal = 0; deal < deals; deal += 1) {
    const deck = shuffleDeck();
    let total = 0;
    for (let seat = 0; seat < size; seat += 1) total += play(botIds, seat, size, deck, deal, bot);
    results.push((total / size / BB) * 100);
  }
  const mean = results.reduce((sum, value) => sum + value, 0) / results.length;
  const variance = results.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, results.length - 1);
  console.log(`${label.padEnd(26)} double vs ${size - 1} bot(s): ${mean.toFixed(1).padStart(7)} ± ${(1.96 * Math.sqrt(variance / results.length)).toFixed(1)} bb/100  (${deals} deals × ${size} seats)`);
};

if (process.argv[1]?.endsWith('pokerBotVsProfile.ts')) {
  const deals = argument('--deals', 300);
  const size = argument('--bots', 1) + 1;
  const refIndex = process.argv.indexOf('--ref');
  const ref = refIndex >= 0 ? process.argv[refIndex + 1] : '927a2e5^';
  const current = await import('../server/services/pokerBot.ts');
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'baseline');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'pokerBotBaseline.ts');
  writeFileSync(file, execFileSync('git', ['show', `${ref}:src/server/services/pokerBot.ts`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .replaceAll("'./pokerEngine.ts'", "'../../server/services/pokerEngine.ts'").replaceAll("from './", "from '../../server/services/"));
  const baseline = await import(pathToFileURL(file).href);
  measure('current bot', current.chooseStrongBotAction as Choose, current.resetPokerBotMemoryForTests, size, deals);
  measure(`baseline ${ref}`, baseline.chooseStrongBotAction as Choose, baseline.resetPokerBotMemoryForTests, size, deals);
}
