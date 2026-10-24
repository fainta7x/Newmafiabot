import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A finished club game is read through `completedClubGame.ts` (`isCompletedClubGame`, or the stricter
 * `isCompletedClubGamePayload` that also needs the player results). A screen or a report must not spell the rule out
 * again. The files below keep their own check on purpose: the rating and the Elo also demand `version === 1`
 * (and are not touched until the Elo questions are answered), the betting reads the kind and status as SQL columns.
 */
const ON_PURPOSE: Record<string, string> = {
  'src/server/services/eloRatingService.ts': 'also requires version 1; Elo is audited separately',
  'src/server/services/ratingPeriodStandingsService.ts': 'also requires version 1',
  'src/server/services/clubGameTokenSettlementService.ts': 'also requires version 1; token settlement is money and is not touched by a refactor',
  'src/server/services/bettingPoolService.ts': 'reads protocol_kind / protocol_status columns',
};
const RULE = /club_evening_protocol'[^;\n]*status\s*[!=]==\s*'completed'|protocol_kind[^;\n]*protocol_status[^;\n]*'completed'/;

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === 'tests' || name === 'node_modules') return [];
  return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
});

describe('a completed club game has one reader', () => {
  it('spells «club protocol, status completed» only in the owner module and the documented exceptions', () => {
    const found = walk('src')
      .map((file) => file.replace(/\\/g, '/'))
      .filter((file) => file !== 'src/server/services/completedClubGame.ts')
      .filter((file) => RULE.test(readFileSync(file, 'utf8')))
      .sort();
    expect(found).toEqual(Object.keys(ON_PURPOSE).sort());
  });
});
