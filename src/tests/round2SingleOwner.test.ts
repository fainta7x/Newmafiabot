import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { round2 } from '../shared/numbers.ts';

describe('round2', () => {
  it('rounds half up the way people expect, including binary fractions', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0.3)).toBe(0.3);
    expect(round2(-0.6)).toBe(-0.6);
    expect(round2('1.234')).toBe(1.23);
    expect(round2(0)).toBe(0);
  });
});

/**
 * Scores and points are rounded by `round2` (owner, 2026-10-24). The three files below round money or a stored score by
 * hand and are not changed by a display refactor.
 */
const ON_PURPOSE = [
  'src/server/routes/eveningStaffRoutes.ts',
  'src/server/services/clubGameProtocolService.ts',
  'src/server/services/closedEveningPaymentService.ts',
];
const COPY = /Math\.round\([^\n]*\* 100\) \/ 100/;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === 'tests' || name === 'node_modules') return [];
  return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
});

describe('two-decimal rounding has one owner', () => {
  it('is written by hand only in the money and stored-score files', () => {
    const found = walk('src').map((file) => file.replace(/\\/g, '/')).filter((file) => file !== 'src/shared/numbers.ts' && COPY.test(readFileSync(file, 'utf8'))).sort();
    expect(found).toEqual([...ON_PURPOSE].sort());
  });
});
