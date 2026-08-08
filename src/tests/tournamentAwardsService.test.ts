import { describe, expect, it } from 'vitest';
import {
  buildPlayerAwardStats,
  getHistoricalAwardDefaultTitle,
  getTournamentAwardDefinition,
  isHistoricalAwardKey,
  isTournamentAwardKey,
  TOURNAMENT_AWARD_DEFINITIONS,
} from '../server/services/tournamentAwardsService.ts';

describe('tournament awards service', () => {
  it('defines exactly three placements and five nomination categories', () => {
    expect(TOURNAMENT_AWARD_DEFINITIONS.filter((item) => item.kind === 'placement')).toHaveLength(3);
    expect(TOURNAMENT_AWARD_DEFINITIONS.filter((item) => item.kind === 'nomination')).toHaveLength(5);
    expect(getTournamentAwardDefinition('nomination_mvp')?.title).toBe('MVP');
  });

  it('validates supported award keys', () => {
    expect(isTournamentAwardKey('place_1')).toBe(true);
    expect(isTournamentAwardKey('nomination_best_don')).toBe(true);
    expect(isTournamentAwardKey('place_4')).toBe(false);
  });

  it('accepts custom historical nominations without adding them to official tournament slots', () => {
    expect(isHistoricalAwardKey('nomination_other')).toBe(true);
    expect(isTournamentAwardKey('nomination_other')).toBe(false);
    expect(getHistoricalAwardDefaultTitle('nomination_other')).toBe('Номинация');
    expect(getHistoricalAwardDefaultTitle('place_1')).toBe('1 место');
  });

  it('counts podium places and nominations independently', () => {
    const stats = buildPlayerAwardStats([
      { key: 'place_1', kind: 'placement' },
      { key: 'place_1', kind: 'placement' },
      { key: 'place_2', kind: 'placement' },
      { key: 'place_3', kind: 'placement' },
      { key: 'nomination_mvp', kind: 'nomination' },
      { key: 'nomination_best_citizen', kind: 'nomination' },
    ] as any);

    expect(stats).toEqual({ firstPlaces: 2, secondPlaces: 1, thirdPlaces: 1, nominations: 2 });
  });
});
