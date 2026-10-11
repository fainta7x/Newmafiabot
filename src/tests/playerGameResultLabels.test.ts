import { describe, expect, it } from 'vitest';
import { getPlayerGameWinnerLabel } from '../lib/playerGameResultLabels.ts';

describe('shared player game winner labels', () => {
  it.each([
    ['red', '🔴 Победа красных'],
    ['black', '⚫ Победа чёрных'],
  ] as const)('maps winner %s to %s', (winner, expected) => {
    expect(getPlayerGameWinnerLabel(winner)).toBe(expected);
  });

  it('does not fabricate a winner for an unknown outcome', () => {
    expect(getPlayerGameWinnerLabel(null)).toBeNull();
  });

  it('allows archive and game detail to keep their distinct missing-result copy', () => {
    expect(getPlayerGameWinnerLabel(null) ?? 'Результат').toBe('Результат');
    expect(getPlayerGameWinnerLabel(null) ?? 'Результат не указан').toBe('Результат не указан');
  });
});
