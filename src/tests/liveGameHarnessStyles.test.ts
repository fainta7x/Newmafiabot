import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const cssImports = (file: string, prefix: string) => [...readFileSync(file, 'utf8').matchAll(/^import ["']([^"']+\.css)["'];/gm)]
  .map((match) => match[1].replace(prefix, ''));

describe('live game browser harness', () => {
  // 2026-10-27: the harness missed four of the app's stylesheets, so browser tests and screenshots showed a layout the
  // phones never had (the avatars off their cards, a vote panel that overlapped only in the real app).
  it.each(['e2e/live-game-harness.tsx', 'e2e/player-profile-harness.tsx', 'e2e/player-cabinet-harness.tsx'])('%s loads the same stylesheets in the same order as the app', (file) => {
    expect(cssImports(file, '../src/')).toEqual(cssImports('src/main.tsx', './'));
  });
});
