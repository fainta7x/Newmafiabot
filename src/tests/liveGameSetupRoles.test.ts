import { describe, expect, it } from 'vitest';
import type { ActivePlayerState } from '../components/LiveGameEngine/types.js';
import {
  buildPhysicalRoleAssignments,
  liveRoleToPhysical,
  physicalRoleToLive,
  protocolRoleToLiveRole,
  roleDistributionIsValid,
  roleSetupIsValid,
  type LiveRole,
} from '../components/LiveGameEngine/setupRoles.js';

const seat = (role: LiveRole, userId = 1, slotNum = 1): ActivePlayerState => ({
  role,
  user_id: userId,
  slot_num: slotNum,
} as ActivePlayerState);

const validSetup = (): ActivePlayerState[] => [
  ...Array.from({ length: 6 }, (_, index) => seat('Мирный', 1, index + 1)),
  seat('Шериф', 1, 7),
  seat('Мафия', 1, 8),
  seat('Мафия', 1, 9),
  seat('Дон', 1, 10),
];

describe('Live Game setup role helpers', () => {
  it('maps physical and live roles in both directions', () => {
    expect(physicalRoleToLive('citizen')).toBe('Мирный');
    expect(physicalRoleToLive('sheriff')).toBe('Шериф');
    expect(physicalRoleToLive('mafia')).toBe('Мафия');
    expect(physicalRoleToLive('don')).toBe('Дон');
    expect(liveRoleToPhysical('Мирный')).toBe('citizen');
    expect(liveRoleToPhysical('Шериф')).toBe('sheriff');
    expect(liveRoleToPhysical('Мафия')).toBe('mafia');
    expect(liveRoleToPhysical('Дон')).toBe('don');
  });

  it('normalizes tournament protocol roles without widening the accepted vocabulary', () => {
    expect(protocolRoleToLiveRole(' citizen ')).toBe('Мирный');
    expect(protocolRoleToLiveRole('МИРНЫЙ')).toBe('Мирный');
    expect(protocolRoleToLiveRole('Sheriff')).toBe('Шериф');
    expect(protocolRoleToLiveRole('шериф')).toBe('Шериф');
    expect(protocolRoleToLiveRole('MAFIA')).toBe('Мафия');
    expect(protocolRoleToLiveRole('мафия')).toBe('Мафия');
    expect(protocolRoleToLiveRole('Don')).toBe('Дон');
    expect(protocolRoleToLiveRole('дон')).toBe('Дон');
    expect(protocolRoleToLiveRole('unknown')).toBeNull();
  });

  it('separates a valid 6/1/2/1 role distribution from a fully assigned setup', () => {
    const players = validSetup();
    players[0] = seat('Мирный', 0, 1);
    expect(roleDistributionIsValid(players)).toBe(true);
    expect(roleSetupIsValid(players)).toBe(false);
  });

  it('accepts exactly ten assigned seats with the 6/1/2/1 setup', () => {
    expect(roleDistributionIsValid(validSetup())).toBe(true);
    expect(roleSetupIsValid(validSetup())).toBe(true);
  });

  it('rejects the wrong seat count or role distribution', () => {
    expect(roleSetupIsValid(validSetup().slice(0, 9))).toBe(false);
    const players = validSetup();
    players[0] = seat('Мафия', 1, 1);
    expect(roleDistributionIsValid(players)).toBe(false);
    expect(roleSetupIsValid(players)).toBe(false);
    expect(buildPhysicalRoleAssignments(players)).toEqual({});
  });

  it('builds physical-role assignments only for the existing valid distribution', () => {
    expect(buildPhysicalRoleAssignments(validSetup())).toEqual({
      1: 'citizen',
      2: 'citizen',
      3: 'citizen',
      4: 'citizen',
      5: 'citizen',
      6: 'citizen',
      7: 'sheriff',
      8: 'mafia',
      9: 'mafia',
      10: 'don',
    });
  });
});