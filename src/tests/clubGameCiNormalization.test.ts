import { describe, expect, it } from 'vitest';
import { canonicalizeClubGameSave } from '../server/services/clubGameProtocolService.ts';

const roles = ['citizen', 'mafia', 'citizen', 'sheriff', 'citizen', 'mafia', 'citizen', 'don', 'citizen', 'citizen'];
const base = () => roles.map((role, index) => ({
  participant_id: `pt${index + 1}`, seat_number: index + 1, player_id: `p${index + 1}`, display_name: `Игрок ${index + 1}`, role,
  exit_type: 'alive', regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, technical_fouls: 0,
  judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, ci_points: 0, color_protocol: [],
}));
const previous = { version: 1, kind: 'club_evening_protocol', protocol: { status: 'draft' }, player_results: base() };
// pt1 is the first-killed red player; seats 2 and 6 are mafia, 8 is the don.
const goodMove = [{ participant_id: 'pt1', source: 'first_killed', seat_numbers: [2, 3, 5] }];
const save = (mutate: (rows: any[]) => void, options: { firstKilled?: string | null; winner?: 'red' | 'black'; bestMoves?: any[] } = {}) => {
  const rows = base();
  mutate(rows);
  const firstKilled = options.firstKilled === undefined ? 'pt1' : options.firstKilled;
  const saved = canonicalizeClubGameSave(previous, {
    status: 'completed', winner_team: options.winner || 'black', first_killed_participant_id: firstKilled, best_moves: options.bestMoves === undefined ? goodMove : options.bestMoves,
  }, rows, 'completed');
  return Object.fromEntries(saved.playerResults.map((row: any) => [row.participant_id, row.ci_points]));
};

describe('Ci compensation on a club save', () => {
  it('keeps the first-killed red player value (reds lost) up to the 0.4 rate and drops it everywhere else', () => {
    const ci = save((rows) => { rows[0].ci_points = 0.25; rows[2].ci_points = 0.3; rows[1].ci_points = 0.4; });
    expect(ci.pt1).toBe(0.25);
    expect(ci.pt3).toBe(0);
    expect(ci.pt2).toBe(0);
  });

  it('allows only half the rate when the reds won', () => {
    expect(save((rows) => { rows[0].ci_points = 0.4; }, { winner: 'red' }).pt1).toBe(0.2);
    expect(save((rows) => { rows[0].ci_points = 0.1; }, { winner: 'red' }).pt1).toBe(0.1);
  });

  it('gives nothing unless the first-killed best move names a black player', () => {
    expect(save((rows) => { rows[0].ci_points = 0.3; }, { bestMoves: [{ participant_id: 'pt1', source: 'first_killed', seat_numbers: [3, 5, 7] }] }).pt1).toBe(0);
    expect(save((rows) => { rows[0].ci_points = 0.3; }, { bestMoves: [] }).pt1).toBe(0);
  });

  it('caps the rate at 0.4 and never allows a negative value', () => {
    expect(save((rows) => { rows[0].ci_points = 5; }).pt1).toBe(0.4);
    expect(save((rows) => { rows[0].ci_points = -2; }).pt1).toBe(0);
  });

  it('gives nobody Ci when there is no first-killed player', () => {
    expect(Object.values(save((rows) => { rows[0].ci_points = 0.3; rows[3].ci_points = 0.2; }, { firstKilled: null, bestMoves: [] })).every((value) => value === 0)).toBe(true);
  });

  it('gives no Ci to a first-killed player who is black', () => {
    expect(save((rows) => { rows[1].ci_points = 0.3; }, { firstKilled: 'pt2', bestMoves: [{ participant_id: 'pt2', source: 'first_killed', seat_numbers: [6] }] }).pt2).toBe(0);
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
