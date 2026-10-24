/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { formatColorMark, getProtocolPayload, buildLegacyTechFoulClassification, formatSignedBonus } from '../components/crm/tournaments/GameProtocolModal';

import { calculateDisciplinaryPenalty } from '../lib/gameDiscipline';

describe('Disciplinary Penalty Scenarios', () => {
  it('Scenario 1: 1 minor tech foul = -0.3', () => {
    expect(calculateDisciplinaryPenalty(1, 0, false, false)).toBe(0.3);
  });

  it('Scenario 2: 2 minor tech fouls = -0.6 (and removal)', () => {
    expect(calculateDisciplinaryPenalty(2, 0, true, false)).toBe(1.6);
  });

  it('Scenario 3: 1 major tech foul = -0.6', () => {
    expect(calculateDisciplinaryPenalty(0, 1, false, false)).toBe(0.6);
  });

  it('Scenario 4: 2 major tech fouls = -1.2 (and removal)', () => {
    expect(calculateDisciplinaryPenalty(0, 2, true, false)).toBe(2.2);
  });

  it('Scenario 5: 1 minor + 1 major = -0.9 (and removal)', () => {
    expect(calculateDisciplinaryPenalty(1, 1, true, false)).toBe(1.9);
  });

  it('Scenario 6: Removal by judge (exit_type=removed) = -1.0', () => {
    expect(calculateDisciplinaryPenalty(0, 0, true, false)).toBe(1.0);
  });

  it('Scenario 7: Removal by judge + 1 minor tech foul = -1.3', () => {
    expect(calculateDisciplinaryPenalty(1, 0, true, false)).toBe(1.3);
  });

  it('Scenario 8: PPK culprit (isPpkCulprit=true) = -1.0', () => {
    expect(calculateDisciplinaryPenalty(0, 0, false, true)).toBe(1.0);
  });

  it('Scenario 9: PPK culprit + 2 minor tech fouls = -1.6', () => {
    // Note: PPK culprit is not necessarily "removed" in the same sense as foul removal, but gets +1.0
    expect(calculateDisciplinaryPenalty(2, 0, false, true)).toBe(1.6);
  });

  it('Scenario 10: Removal for 4 fouls = -1.0', () => {
    expect(calculateDisciplinaryPenalty(0, 0, true, false)).toBe(1.0);
  });
});

describe('GameProtocolModal Frontend Helpers', () => {
  it('formats color marks correctly', () => {
    expect(formatColorMark({ seat_numbers: [4], mark: 'red' })).toBe('4 кр');
    expect(formatColorMark({ seat_numbers: [2, 1], mark: 'black' })).toBe('1 2 ч');
    expect(formatColorMark({ seat_numbers: [5], mark: 'sheriff' })).toBe('5 ш');
    expect(formatColorMark({ seat_numbers: [8, 3], mark: 'red' })).toBe('3 8 кр');
  });

  it('handles empty or missing seat_numbers gracefully', () => {
    expect(formatColorMark({ seat_numbers: [], mark: 'red' })).toBe(' кр');
    expect(formatColorMark(null as any)).toBe('');
  });
});


describe('GameProtocolModal payload and helpers', () => {
  const player = (extra: Record<string, unknown> = {}) => ({
    participant_id: 'p-1', seat_number: 1, display_name: 'Player 1', role: 'citizen', exit_type: 'alive', exit_order: null,
    regular_fouls: 0, technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, ci_points: 0, color_protocol: [], notes: null, ...extra,
  });
  const protocol = { game_id: 'g', status: 'draft', winner_team: null, first_killed_participant_id: null, zero_round_voted_participant_id: null, best_move_participant_id: null, best_move_source: null, best_move_seats: [], votes: [], shots: [], replacement: null, judge_notes: null, best_move_score: 0 };

  it('Scenario 1: payload contains correct minor/major tech fouls and removal_reason', () => {
    const results = [player({ minor_technical_fouls: 1, major_technical_fouls: 1, exit_type: 'removed', removal_reason: '2nd_tech' })] as any;
    const p1 = getProtocolPayload(protocol as any, results).player_results[0];
    expect(p1.minor_technical_fouls).toBe(1);
    expect(p1.major_technical_fouls).toBe(1);
    expect(p1.technical_fouls).toBe(2);
    expect(p1.exit_type).toBe('removed');
    expect(p1.removal_reason).toBe('2nd_tech');
    expect(p1.disciplinary_penalty_points).toBe(1.9);
  });

  it('Scenario 2: classification of two old tech fouls returns removed and 2nd_tech', () => {
    const res2 = buildLegacyTechFoulClassification(1, 1);
    expect(res2.minor_technical_fouls).toBe(1);
    expect(res2.major_technical_fouls).toBe(1);
    expect(res2.technical_fouls).toBe(2);
    expect(res2.exit_type).toBe('removed');
    expect(res2.removal_reason).toBe('2nd_tech');
    const res1 = buildLegacyTechFoulClassification(1, 0);
    expect(res1.minor_technical_fouls).toBe(1);
    expect(res1.technical_fouls).toBe(1);
    expect(res1.exit_type).toBeUndefined();
    expect(res1.removal_reason).toBeUndefined();
  });

  it('unit test formatSignedBonus helper', () => {
    expect(formatSignedBonus(0.2)).toEqual({ formatted: '+0.2', sign: 'positive', num: 0.2 });
    expect(formatSignedBonus(-0.2)).toEqual({ formatted: '−0.2', sign: 'negative', num: -0.2 });
    expect(formatSignedBonus(-0.6)).toEqual({ formatted: '−0.6', sign: 'negative', num: -0.6 });
    expect(formatSignedBonus(0)).toEqual({ formatted: '0', sign: 'zero', num: 0 });
    expect(formatSignedBonus(-0)).toEqual({ formatted: '0', sign: 'zero', num: 0 });
    expect(formatSignedBonus(null)).toEqual({ formatted: '0', sign: 'zero', num: 0 });
  });
});
