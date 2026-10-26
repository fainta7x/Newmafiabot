import { describe, expect, it } from 'vitest';
import { gameContribution } from '../lib/playerContribution.ts';
import { ELO_PERSONAL_POINT_WEIGHT } from '../shared/eloWeights.ts';
import { validatePlayerResults } from '../lib/protocolConsistency.ts';

const roles = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];
const results = () => roles.map((role, index) => ({
  participant_id: `p${index + 1}`, player_id: `p${index + 1}`, seat_number: index + 1, role,
  exit_type: 'alive', exit_order: null as number | null, regular_fouls: 0, minor_technical_fouls: 0,
  major_technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, ci_points: 0,
  color_protocol: [] as Array<{ mark: string; seat_numbers: number[] }>,
}));
const elo = (rows: ReturnType<typeof results>, seat: number, events: any[] = []) =>
  gameContribution({ protocol: { winner_team: 'red', events }, player_results: rows }).find((row) => row.seat === seat)!.points * ELO_PERSONAL_POINT_WEIGHT;

describe('Elo colour evidence integrity', () => {
  it('rejects own colour marks and ignores them when rebuilding historical records', () => {
    const rows = results(); rows[0].exit_type = 'killed';
    rows[0].color_protocol = [{ mark: 'red', seat_numbers: [1] }];
    expect(validatePlayerResults(rows, rows, 'p1')).toContain('собственное место');
    expect(elo(rows, 1)).toBe(0);
    expect(elo(rows, 8)).toBe(0);
  });

  it('rejects opposite colours for one target and gives neither side an award for old conflicts', () => {
    const rows = results(); rows[0].exit_type = 'killed';
    rows[0].color_protocol = [{ mark: 'red', seat_numbers: [8] }, { mark: 'black', seat_numbers: [8] }];
    expect(validatePlayerResults(rows, rows, 'p1')).toContain('противоречивыми цветами');
    expect(elo(rows, 1)).toBe(0);
    expect(elo(rows, 8)).toBe(0);
  });

  it('keeps compatible red and sheriff labels, but rejects sheriff and black', () => {
    const rows = results(); rows[0].exit_type = 'killed';
    rows[0].color_protocol = [{ mark: 'red', seat_numbers: [7] }, { mark: 'sheriff', seat_numbers: [7] }];
    expect(validatePlayerResults(rows, rows, 'p1')).toBeNull();
    rows[0].color_protocol[0].mark = 'black';
    expect(validatePlayerResults(rows, rows, 'p1')).toContain('противоречивыми цветами');
  });

  it('uses confirmed exit order when an old game has no event log', () => {
    const rows = results(); rows[0].exit_type = 'killed'; rows[0].exit_order = 2;
    rows[0].color_protocol = [{ mark: 'red', seat_numbers: [2] }];
    rows[7].exit_type = 'voted_day'; rows[7].exit_order = 1;
    rows[8].exit_type = 'voted_day'; rows[8].exit_order = 3;
    expect(elo(rows, 8)).toBe(0);
    expect(elo(rows, 9)).toBe(4);
    expect(elo(rows, 10)).toBe(4);
  });

  it('does not invent eligibility for an out black with no chronology', () => {
    const rows = results(); rows[0].exit_type = 'killed';
    rows[0].color_protocol = [{ mark: 'red', seat_numbers: [8] }]; rows[7].exit_type = 'voted_day';
    expect(elo(rows, 8)).toBe(0);
  });

  it.each(['red', 'black', 'unmentioned'])('scores %s testimony only while the black was in play', (mark) => {
    const rows = results(); rows[0].exit_type = 'killed'; rows[7].exit_type = 'voted_day';
    rows[0].color_protocol = [{ mark: mark === 'unmentioned' ? 'red' : mark, seat_numbers: [mark === 'unmentioned' ? 2 : 8] }];
    const event = (kind: string, seat?: number, value?: string) => ({ seq: 0, at: 'x', round: 2, phase: 'night', kind, seat, value });
    const events = [event('game_start'), event('exit', 8, 'voted_day'), event('exit', 1, 'killed')];
    events[0].phase = 'zero_night'; events[0].round = 1;
    expect(elo(rows, 8, events)).toBe(0);
    const beforeExit = [events[0], events[2], events[1]];
    expect(Math.round(elo(rows, 8, beforeExit))).toBe((mark === 'red' ? 8 : mark === 'black' ? -4 : 4) - 8); // −8: voted out at the девятка (owner, 2026-10-26)
  });
});

