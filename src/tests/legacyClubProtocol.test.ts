import { describe, expect, it } from 'vitest';
import { describeLegacyRepair, describeLegacyRepairs, repairLegacyClubProtocol } from '../lib/legacyClubProtocol';

const results = (killed: number[]) => Array.from({ length: 10 }, (_, index) => ({
  seat_number: index + 1,
  exit_type: killed.includes(index + 1) ? 'killed' : 'alive',
})) as any;

const round = (day: number, number: number, extra: Record<string, unknown> = {}) => ({
  day_number: day, round_number: number, is_revote: false, nominated_seats: [2, 5], vote_counts: { 2: 5, 5: 5 }, eligible_voters: 10,
  parent_round_number: null, outcome: 'tie_revote', eliminated_seats: [], table_leave_votes: null, ...extra,
});

describe('legacy club protocol repair', () => {
  it('turns a «промах» at a player who left as killed into the kill it was', () => {
    const protocol = {
      shots: [
        { night_number: 1, target_seat: 8, result: 'miss' },
        { night_number: 2, target_seat: 10, result: 'miss' },
        { night_number: 3, target_seat: 0, result: 'agreement_failed' },
      ],
    } as any;
    const { protocol: repaired, repairs } = repairLegacyClubProtocol(protocol, results([8, 10]));
    expect(repaired.shots.map((shot: any) => shot.result)).toEqual(['killed', 'killed', 'agreement_failed']);
    expect(repairs.map(describeLegacyRepair)).toEqual([
      'ночь 1: игрок #8 убит (в записи было «промах»)',
      'ночь 2: игрок #10 убит (в записи было «промах»)',
    ]);
    expect(describeLegacyRepairs(repairs)).toEqual(['ночи 1, 2: убитые игроки (#8, #10) были записаны как «промах»']);
  });

  it('leaves a real miss alone: the target did not die', () => {
    const protocol = { shots: [{ night_number: 1, target_seat: 4, result: 'miss' }] } as any;
    const { protocol: repaired, repairs } = repairLegacyClubProtocol(protocol, results([8]));
    expect(repaired).toBe(protocol);
    expect(repairs).toEqual([]);
  });

  it('does not count one player as killed twice', () => {
    const protocol = { shots: [{ night_number: 1, target_seat: 8, result: 'killed' }, { night_number: 2, target_seat: 8, result: 'miss' }] } as any;
    expect(repairLegacyClubProtocol(protocol, results([8])).repairs).toEqual([]);
  });

  it('numbers the rounds one after another when the engine\'s per-day numbers repeat, and re-points the revote', () => {
    const protocol = { votes: [
      round(0, 1), round(0, 2, { is_revote: true, parent_round_number: 1, outcome: 'no_elimination' }),
      round(1, 1, { outcome: 'single_eliminated', eliminated_seats: [2] }),
    ] } as any;
    const { protocol: repaired, repairs } = repairLegacyClubProtocol(protocol, results([]));
    expect(repaired.votes.map((vote: any) => [vote.day_number, vote.round_number, vote.parent_round_number])).toEqual([[0, 1, null], [0, 2, 1], [1, 3, null]]);
    expect(repairs).toEqual([{ kind: 'round_numbers' }]);
  });

  it('keeps already unique round numbers untouched', () => {
    const protocol = { votes: [round(0, 1), round(0, 2, { is_revote: true, parent_round_number: 1, outcome: 'no_elimination' })] } as any;
    const { protocol: repaired, repairs } = repairLegacyClubProtocol(protocol, results([]));
    expect(repaired).toBe(protocol);
    expect(repairs).toEqual([]);
  });

  it('does not renumber two rounds of the same day with the same number: that is a malformed record', () => {
    const protocol = { votes: [round(0, 1), round(0, 1)] } as any;
    const { protocol: repaired, repairs } = repairLegacyClubProtocol(protocol, results([]));
    expect(repaired).toBe(protocol);
    expect(repairs).toEqual([]);
  });
});
