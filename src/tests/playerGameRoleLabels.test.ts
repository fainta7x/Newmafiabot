import { describe, expect, it } from 'vitest';
import { getPlayerGameRoleLabel } from '../lib/playerGameRoleLabels.ts';

describe('player game role labels', () => {
  it.each([
    ['citizen', 'Мирный'],
    ['sheriff', 'Шериф'],
    ['mafia', 'Мафия'],
    ['don', 'Дон'],
  ])('maps %s to %s', (role, label) => {
    expect(getPlayerGameRoleLabel(role)).toBe(label);
  });

  it.each([null, undefined, '', 'unknown', 'Citizen'])(
    'does not guess missing or unknown roles (%s)',
    (role) => {
      expect(getPlayerGameRoleLabel(role)).toBeNull();
    },
  );

  it('lets callers preserve their own unknown-role fallback', () => {
    expect(getPlayerGameRoleLabel('unknown') ?? 'unknown').toBe('unknown');
    expect(getPlayerGameRoleLabel(null) ?? '—').toBe('—');
    expect(getPlayerGameRoleLabel(null)).toBeNull();
  });
});
