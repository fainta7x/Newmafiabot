import { describe, expect, it } from 'vitest';
import { rankRolePerformance } from '../lib/rolePerformance.ts';

describe('role performance without minimum-game cut-offs', () => {
  it('ranks the observed win rate before sample size, for both strongest and weakest', () => {
    const roles = [{ role: 'citizen', games: 20, wins: 15 }, { role: 'don', games: 1, wins: 1 }, { role: 'mafia', games: 1, wins: 0 }];
    expect(rankRolePerformance(roles).map(role => role.role)).toEqual(['don', 'citizen', 'mafia']);
    expect(rankRolePerformance(roles, true).map(role => role.role)).toEqual(['mafia', 'citizen', 'don']);
    expect(roles[0].role).toBe('citizen');
  });

  it('uses game count only for equal rates and keeps stable role order on exact ties', () => {
    expect(rankRolePerformance([{ role: 'don', games: 1, wins: 1 }, { role: 'mafia', games: 2, wins: 2 }, { role: 'sheriff', games: 2, wins: 2 }]).map(role => role.role)).toEqual(['mafia', 'sheriff', 'don']);
  });

  it('does not invent a result for an unplayed role', () => {
    expect(rankRolePerformance([{ games: 0, wins: 0 }])).toEqual([]);
    expect(rankRolePerformance([])).toEqual([]);
  });
});
