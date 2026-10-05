import { describe, expect, it } from 'vitest';
import { canonicalizeClubGameSave } from '../server/services/clubGameProtocolService.ts';

const roles = ['citizen', 'mafia', 'citizen', 'sheriff', 'citizen', 'mafia', 'citizen', 'don', 'citizen', 'citizen'];
const base = () => roles.map((role, index) => ({
  participant_id: `pt${index + 1}`, seat_number: index + 1, player_id: `p${index + 1}`, display_name: `Игрок ${index + 1}`, role,
  exit_type: 'alive', regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, technical_fouls: 0,
  judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, ci_points: 0, color_protocol: [],
}));
const previous = { version: 1, kind: 'club_evening_protocol', protocol: { status: 'draft' }, player_results: base() };
const save = (mutate: (rows: any[]) => void, firstKilled: string | null = 'pt1') => {
  const rows = base();
  mutate(rows);
  const saved = canonicalizeClubGameSave(previous, { status: 'completed', winner_team: 'red', first_killed_participant_id: firstKilled }, rows, 'completed');
  return Object.fromEntries(saved.playerResults.map((row: any) => [row.participant_id, row.ci_points]));
};

describe('Ci compensation on a club save', () => {
  it('keeps the first-killed red player value up to the 0.4 rate and drops it everywhere else', () => {
    const ci = save((rows) => { rows[0].ci_points = 0.25; rows[2].ci_points = 0.3; rows[1].ci_points = 0.4; });
    expect(ci.pt1).toBe(0.25);
    expect(ci.pt3).toBe(0);
    expect(ci.pt2).toBe(0);
  });

  it('caps the rate at 0.4 and never allows a negative value', () => {
    expect(save((rows) => { rows[0].ci_points = 5; }).pt1).toBe(0.4);
    expect(save((rows) => { rows[0].ci_points = -2; }).pt1).toBe(0);
  });

  it('gives nobody Ci when there is no first-killed player', () => {
    expect(Object.values(save((rows) => { rows[0].ci_points = 0.3; rows[3].ci_points = 0.2; }, null)).every((value) => value === 0)).toBe(true);
  });

  it('gives no Ci to a first-killed player who is black', () => {
    expect(save((rows) => { rows[1].ci_points = 0.3; }, 'pt2').pt2).toBe(0);
  });
});

describe('judge and protocol bonus rounding on a club save', () => {
  it('rounds plus and minus half-steps the same way', () => {
    const rows = base();
    rows[0].judge_bonus = 0.05;
    rows[1].judge_bonus = -0.05;
    rows[2].protocol_bonus = 0.14;
    rows[3].protocol_bonus = -0.14;
    const saved = canonicalizeClubGameSave(previous, { status: 'draft' }, rows, 'draft');
    const by = (id: string) => saved.playerResults.find((row: any) => row.participant_id === id);
    expect(by('pt1').judge_bonus).toBe(0.1);
    expect(by('pt2').judge_bonus).toBe(-0.1);
    expect(by('pt3').protocol_bonus).toBe(0.1);
    expect(by('pt4').protocol_bonus).toBe(-0.1);
  });
});
