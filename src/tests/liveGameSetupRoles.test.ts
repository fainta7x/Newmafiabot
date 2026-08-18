import { describe, expect, it } from 'vitest';
import type { ActivePlayerState } from '../components/LiveGameEngine/types.js';
import { physicalRoleToLive, roleSetupIsValid, type LiveRole } from '../components/LiveGameEngine/setupRoles.js';

const seat = (role: LiveRole, userId = 1): ActivePlayerState => ({ role, user_id: userId } as ActivePlayerState);

const validSetup = (): ActivePlayerState[] => [
  ...Array.from({ length: 6 }, () => seat('Мирный')),
  seat('Шериф'),
  seat('Мафия'),
  seat('Мафия'),
  seat('Дон'),
];

describe('Live Game setup role helpers', () => {
  it('maps every physical role to the existing live role vocabulary', () => {
    expect(physicalRoleToLive('citizen')).toBe('Мирный');
    expect(physicalRoleToLive('sheriff')).toBe('Шериф');
    expect(physicalRoleToLive('mafia')).toBe('Мафия');
    expect(physicalRoleToLive('don')).toBe('Дон');
  });

  it('accepts exactly ten assigned seats with the 6/1/2/1 setup', () => {
    expect(roleSetupIsValid(validSetup())).toBe(true);
  });

  it('rejects an unassigned seat even when the role counts are otherwise valid', () => {
    const players = validSetup();
    players[0] = seat('Мирный', 0);
    expect(roleSetupIsValid(players)).toBe(false);
  });

  it('rejects the wrong seat count or role distribution', () => {
    expect(roleSetupIsValid(validSetup().slice(0, 9))).toBe(false);
    const players = validSetup();
    players[0] = seat('Мафия');
    expect(roleSetupIsValid(players)).toBe(false);
  });
});
