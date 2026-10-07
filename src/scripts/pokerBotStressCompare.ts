/** Seeded diagnostic; synthetic hands only, no database or production access. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { benchmark } from './pokerBotBenchmark.ts';
import * as current from '../server/services/pokerBot.ts';

const ref = process.argv[2] || '1b22551f';
const hands = Number(process.argv[3]) || 100;
const seedCount = Number(process.argv[4]) || 3;
if (![hands, seedCount].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error('Hands and seed count must be positive integers');
const source = execFileSync('git', ['show', `${ref}:src/server/services/pokerBot.ts`], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
  .replaceAll("from './", "from '../../server/services/");
mkdirSync('src/scripts/baseline', { recursive: true });
writeFileSync('src/scripts/baseline/pokerBotStressBaseline.ts', source);
const baseline: typeof current = await import(new URL('./baseline/pokerBotStressBaseline.ts', import.meta.url).href);
for (const opponents of [['maniac'], ['loose', 'loose'], ['station']]) {
  const rows: Array<{ seed: number; old: number; updated: number; delta: number }> = [];
  for (let index = 0; index < seedCount; index += 1) {
    const seed = 123 + index * 7919;
    const run = (module: typeof current) => benchmark(opponents, hands, { seed, learn: true, continuous: true, stack: 1000, policy: { choose: module.chooseStrongBotAction, observe: module.observePokerHand, reset: module.resetPokerBotMemoryForTests } });
    const old = run(baseline);
    const updated = run(current);
    rows.push({ seed, old, updated, delta: updated - old });
  }
  const mean = (key: 'old' | 'updated' | 'delta') => rows.reduce((total, row) => total + row[key], 0) / rows.length;
  // Report seed dispersion, not a misleading normal confidence interval from three evolving sessions.
  console.log(JSON.stringify({ ref, opponents, handsPerSeed: hands, rows, oldMean: mean('old'), updatedMean: mean('updated'), deltaMean: mean('delta'), deltaMin: Math.min(...rows.map((row) => row.delta)), deltaMax: Math.max(...rows.map((row) => row.delta)) }));
}
