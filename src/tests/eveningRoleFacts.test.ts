import { describe, expect, it } from 'vitest';
import { roleFactLine, seatRoleFacts, type RoleFacts } from '../server/services/clubResultData.ts';

const roles = ['citizen', 'mafia', 'sheriff', 'citizen', 'don', 'citizen', 'citizen', 'mafia', 'citizen', 'citizen'];
const base = (): RoleFacts => ({ checks: 0, blackChecks: 0, streak: 0, donFoundAt: null, votes: 0, votesAgainstBlack: 0, markedRed: 0 });
const envelope = (events: any[], colors: Record<number, any[]> = {}) => ({
  protocol: { winner_team: 'red', events: [{ kind: 'game_start', phase: 'setup', round: 1 }, ...events, { kind: 'game_end', value: 'red' }].map((e, i) => ({ seq: i + 1, at: '2026-11-02T10:00:00Z', round: 2, phase: 'night', ...e })) },
  player_results: roles.map((role, i) => ({ seat_number: i + 1, role, player_id: `p${i + 1}`, color_protocol: colors[i + 1] || [] })),
});
const night = (round: number, kind: string, target: number) => [{ kind, phase: 'night', round, target }, { kind: 'night_step', phase: 'night', round, value: 'morning' }];

describe('best of the evening by role says what the player did (owner, 2026-11-02)', () => {
  it('the sheriff: the longest run of blacks found in a row', () => {
    const facts = seatRoleFacts(envelope([...night(2, 'sheriff_check', 2), ...night(3, 'sheriff_check', 8), ...night(4, 'sheriff_check', 4)])).get(3)!;
    expect(facts).toMatchObject({ checks: 3, blackChecks: 2, streak: 2 });
    expect(roleFactLine('sheriff', facts)).toBe('Проверил 2 чёрных подряд');
    expect(roleFactLine('sheriff', { ...base(), checks: 4, blackChecks: 1, streak: 1 })).toBe('Нашёл 1 чёрного из 4 проверок');
    expect(roleFactLine('sheriff', { ...base(), checks: 2 })).toBeNull();
  });

  it('the don: the number of the check that found the sheriff', () => {
    const facts = seatRoleFacts(envelope([...night(2, 'don_check', 4), ...night(3, 'don_check', 3)])).get(5)!;
    expect(facts.donFoundAt).toBe(2);
    expect(roleFactLine('don', facts)).toBe('Нашёл шерифа с 2-й проверки');
    expect(roleFactLine('don', base())).toBeNull();
  });

  it('a red: the share of votes against blacks, only with at least two votes and one hit', () => {
    expect(roleFactLine('citizen', { ...base(), votes: 4, votesAgainstBlack: 3 })).toBe('Голос против чёрных: 75%');
    expect(roleFactLine('citizen', { ...base(), votes: 1, votesAgainstBlack: 1 })).toBeNull();
    expect(roleFactLine('citizen', { ...base(), votes: 3, votesAgainstBlack: 0 })).toBeNull();
  });

  it('a black: how many reds marked him red in the colour protocol', () => {
    const facts = seatRoleFacts(envelope([], { 1: [{ mark: 'red', seat_numbers: [2] }], 4: [{ mark: 'red', seat_numbers: [2, 8] }], 6: [{ mark: 'black', seat_numbers: [2] }] })).get(2)!;
    expect(facts.markedRed).toBe(2);
    expect(roleFactLine('mafia', facts)).toBe('Красные отметили красным 2 раза');
    expect(roleFactLine('mafia', { ...base(), markedRed: 1 })).toBe('Красные отметили красным 1 раз');
    expect(roleFactLine('mafia', base())).toBeNull();
  });
});
