/**
 * Mirrored head-to-head of the poker bot: the current bot against a baseline taken from any git ref, at several table
 * sizes. Every deal is played several times with the seats swapped between the two versions (the same cards, so luck
 * cancels out), which makes a few thousand deals enough to see a real difference.
 *
 *   npx tsx src/scripts/pokerBotCompare.ts [--ref <git ref>] [--deals N] [--lineup <index>]
 *
 * The baseline source is written to `src/scripts/baseline/pokerBotBaseline.ts` (git-ignored). Result: the current bot's
 * big blinds per 100 hands over the baseline (half the gap between the per-seat results of the two versions, so it equals
 * the current bot's own result when the seats are balanced), with a 95% confidence interval (positive = current is better).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { applyPokerAction, createDeck, createPokerHand, shuffleDeck, type PokerState } from '../server/services/pokerEngine.ts';
import type { PokerBotAction } from '../server/services/pokerBot.ts';

const STACK = 2000;
const BB = 20;
type Kind = 'new' | 'old';
type Choose = (hand: PokerState, player: PokerState['players'][number]) => PokerBotAction;

export const LINEUPS: Array<{ name: string; seats: Kind[] }> = [
  { name: 'heads-up 1v1', seats: ['new', 'old'] },
  { name: '3-max 1 new + 2 old', seats: ['new', 'old', 'old'] },
  { name: '3-max 2 new + 1 old', seats: ['new', 'new', 'old'] },
  { name: '4-max 2v2', seats: ['new', 'old', 'new', 'old'] },
  { name: '6-max 3v3', seats: ['new', 'old', 'new', 'old', 'new', 'old'] },
  { name: '6-max 1 new + 5 old', seats: ['new', 'old', 'old', 'old', 'old', 'old'] },
  { name: '6-max 5 new + 1 old', seats: ['new', 'new', 'new', 'new', 'new', 'old'] },
];

/** The seat assignments played for one deal: rotations of the layout, so every version sits in every seat. */
const assignments = (seats: Kind[]): Kind[][] => {
  const size = seats.length;
  const result: Kind[][] = [];
  const seen = new Set<string>();
  for (let shift = 0; shift < size; shift += 1) {
    const rotated = seats.map((_, index) => seats[(index + shift) % size]);
    const key = rotated.join(',');
    if (!seen.has(key)) { seen.add(key); result.push(rotated); }
  }
  return result;
};

const playDeal = (seatKinds: Kind[], deck: ReturnType<typeof createDeck>, dealIndex: number, choose: Record<Kind, Choose>) => {
  const kinds = new Map(seatKinds.map((kind, index) => [`p${index}`, kind]));
  const players = seatKinds.map((_, index) => ({ id: `p${index}`, nickname: `p${index}`, seat: index + 1, chips: STACK, is_bot: true }));
  const hand = createPokerHand({ id: `d${dealIndex}`, players, dealer_seat: (dealIndex % seatKinds.length) + 1, small_blind: BB / 2, big_blind: BB, deck });
  let guard = 0;
  while (hand.street !== 'finished' && hand.street !== 'showdown' && guard++ < 400) {
    const current = hand.players.find((player) => player.seat === hand.current_seat);
    if (!current) break;
    try { applyPokerAction(hand, choose[kinds.get(current.id)!](hand, current)); } catch {
      const toCall = Math.max(0, hand.current_bet - current.committed);
      applyPokerAction(hand, toCall ? { type: 'call' } : { type: 'check' });
    }
  }
  const net: Record<Kind, number> = { new: 0, old: 0 };
  for (const player of hand.players) net[kinds.get(player.id)!] += player.chips - (player.start_chips ?? STACK);
  return net;
};

export const compare = async (seats: Kind[], deals: number, loadBaseline: () => Promise<{ chooseStrongBotAction: Choose; resetPokerBotMemoryForTests: () => void }>) => {
  const current = await import('../server/services/pokerBot.ts');
  const baseline = await loadBaseline();
  current.resetPokerBotMemoryForTests(); baseline.resetPokerBotMemoryForTests();
  const choose: Record<Kind, Choose> = { new: current.chooseStrongBotAction as Choose, old: baseline.chooseStrongBotAction };
  const newSeats = seats.filter((kind) => kind === 'new').length;
  const oldSeats = seats.length - newSeats;
  const layouts = assignments(seats);
  const perDeal: number[] = [];
  for (let deal = 0; deal < deals; deal += 1) {
    const deck = shuffleDeck();
    let diff = 0;
    for (const layout of layouts) {
      const net = playDeal(layout, deck, deal, choose);
      // Per-seat result of each version: their difference over two is the edge of one version over the other.
      diff += (net.new / newSeats - net.old / oldSeats);
    }
    perDeal.push((diff / layouts.length / 2) / BB * 100);
  }
  const mean = perDeal.reduce((sum, value) => sum + value, 0) / perDeal.length;
  const variance = perDeal.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, perDeal.length - 1);
  return { mean, ci: 1.96 * Math.sqrt(variance / perDeal.length), hands: deals * layouts.length * seats.length };
};

const argument = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };

if (process.argv[1]?.endsWith('pokerBotCompare.ts')) {
  const ref = argument('--ref') || '927a2e5^';
  const deals = Number(argument('--deals')) || 300;
  const only = argument('--lineup');
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'baseline');
  const loadBaseline = async () => {
    mkdirSync(dir, { recursive: true });
    const source = execFileSync('git', ['show', `${ref}:src/server/services/pokerBot.ts`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      .replaceAll("'./pokerEngine.ts'", "'../../server/services/pokerEngine.ts'").replaceAll("from './", "from '../../server/services/");
    const file = path.join(dir, 'pokerBotBaseline.ts');
    writeFileSync(file, source);
    return import(pathToFileURL(file).href);
  };
  for (const [index, lineup] of LINEUPS.entries()) {
    if (only !== undefined && Number(only) !== index) continue;
    const started = Date.now();
    const result = await compare(lineup.seats, deals, loadBaseline);
    console.log(`${lineup.name.padEnd(24)} current vs ${ref}: ${result.mean.toFixed(1).padStart(7)} ± ${result.ci.toFixed(1)} bb/100  (${deals} deals, ${result.hands} hands, ${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
}
