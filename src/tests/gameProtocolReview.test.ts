import { describe, expect, it } from 'vitest';
import { tableVotersOf, buildCircles, checksOf, computeChanges, computeIssues, exitsOf, nominatorsOf, roundBallots, roundChain, withBallots } from '../components/crm/gameProtocol/protocolReview';

const ROLES = ['citizen', 'citizen', 'citizen', 'don', 'sheriff', 'citizen', 'mafia', 'mafia', 'citizen', 'citizen'];
const player = (i: number, extra: Record<string, unknown> = {}) => ({
  participant_id: `p${i + 1}`, player_id: `u${i + 1}`, seat_number: i + 1, display_name: `Игрок ${i + 1}`, role: ROLES[i], exit_type: 'alive',
  regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0, color_protocol: [], ...extra,
});
let seq = 0;
const ev = (round: number, kind: string, extra: Record<string, unknown> = {}) => ({ seq: ++seq, at: '', round, phase: '', kind, ...extra });
const results = (over: Record<number, Record<string, unknown>> = {}) => ROLES.map((_, i) => player(i, over[i + 1] || {})) as any[];

const dayOne = { round_number: 1, day_number: 1, is_revote: false, nominated_seats: [7, 4], vote_counts: { 7: 8, 4: 1 }, eligible_voters: 9, outcome: 'single_eliminated', eliminated_seats: [7], table_leave_votes: null };
const voteEvents = () => [
  ev(1, 'exit', { seat: 5, value: 'killed' }),
  ev(2, 'nomination', { seat: 7, by: 2 }), ev(2, 'nomination', { seat: 4, by: 8 }),
  ...[1, 2, 3, 4, 6, 8, 9, 10].map((voter) => ev(2, 'vote', { seat: voter, target: 7, value: 1 })), ev(2, 'vote', { seat: 7, target: 4, value: 1 }),
  ev(2, 'night_step', { value: 'don' }), ev(2, 'night_step', { value: 'sheriff' }),
  ev(2, 'exit', { seat: 7, value: 'voted_day' }),
];
const protocol = (extra: Record<string, unknown> = {}) => ({
  game_id: '1', status: 'draft', winner_team: 'black', votes: [dayOne], shots: [{ night_number: 1, target_seat: 5, result: 'killed' }, { night_number: 2, target_seat: 9, result: 'killed' }], first_killed_participant_id: 'p5', events: voteEvents(), best_moves: [], ...extra,
}) as any;

describe('game protocol review model', () => {
  it('puts the voting of day k and the night after it into circle k', () => {
    const circles = buildCircles(protocol());
    expect(circles.map((circle) => circle.title)).toEqual(['Нулевой день', 'Девятка']);
    expect(circles[1].rootRounds).toEqual([0]);
    expect(circles[0].shotIndex).toBe(0);
    expect(circles[1].shotIndex).toBe(1);
    expect(circles[1].events.length).toBeGreaterThan(5);
  });

  it('reads who voted for whom from the chronology, and refuses ballots that do not add up to the counts', () => {
    const p = protocol();
    expect(roundBallots(p, dayOne as any, 1, 0)).toEqual({ 1: 7, 2: 7, 3: 7, 4: 7, 6: 7, 8: 7, 9: 7, 10: 7, 7: 4 });
    const broken = { ...dayOne, vote_counts: { 7: 7, 4: 2 } };
    expect(roundBallots(p, broken as any, 1, 0)).toBeNull();
    expect(roundBallots(protocol({ events: [] }), dayOne as any, 1, 0)).toBeNull();
  });

  it('counts corrected ballots into the round and leaves its outcome to be confirmed again', () => {
    const next = withBallots(dayOne as any, { 1: 4, 2: 7, 3: 7, 4: 7, 6: 7, 8: 7, 9: 7, 10: 7, 7: 4 });
    expect(next.vote_counts).toEqual({ 7: 7, 4: 2 });
    expect(next.outcome).toBe('pending');
    expect(next.eliminated_seats).toEqual([]);
    expect(roundBallots(protocol({ votes: [next] }), next, 1, 0)).toEqual(next.ballots);
  });

  it('knows who nominated whom, the night checks and who left', () => {
    const events = buildCircles(protocol())[1].events;
    expect(nominatorsOf(events)).toEqual({ 7: 2, 4: 8 });
    expect(checksOf(events)).toMatchObject({ don: null, donStep: true, sheriffStep: true });
    expect(exitsOf(events)).toEqual([{ seat: 7, reason: 'voted_day' }]);
    expect(roundChain(protocol(), 0)).toEqual([0]);
  });

  it('lists what needs the judge: refused checks first, then what the chronology says was left out', () => {
    const issues = computeIssues({ protocol: protocol(), results: results({ 5: { exit_type: 'killed' }, 7: { exit_type: 'voted_day' }, 9: { exit_type: 'killed' } }) });
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    // the sheriff (#5) was killed on the first night, so his missing check is not asked for either
    expect(issues.map((issue) => issue.id)).not.toContain('sheriff-checks');
    // owner, 2026-10-26: a missing don check is not an error
    expect(issues.map((issue) => issue.id)).not.toContain('don-checks');
    const broken = computeIssues({ protocol: protocol({ winner_team: null }), results: results().map((item, i) => (i === 0 ? { ...item, role: null } : item)) });
    expect(broken.filter((issue) => issue.severity === 'error').map((issue) => issue.id)).toEqual(expect.arrayContaining(['roles', 'winner']));
  });

  it('flags a player whose status differs from the game record', () => {
    const wrong = computeIssues({ protocol: protocol(), results: results({ 7: { exit_type: 'voted_day' } }) });
    expect(wrong.map((issue) => issue.id)).toEqual(expect.arrayContaining(['exit-5', 'exit-9']));
    const right = computeIssues({ protocol: protocol(), results: results({ 5: { exit_type: 'killed' }, 7: { exit_type: 'voted_day' }, 9: { exit_type: 'killed' } }) });
    expect(right.some((issue) => issue.id.startsWith('exit-'))).toBe(false);
  });

  it('asks for the announced checks of a black player who revealed', () => {
    const ids = (events: any[]) => computeIssues({ protocol: protocol({ events }), results: results({ 5: { exit_type: 'killed' }, 7: { exit_type: 'voted_day' }, 9: { exit_type: 'killed' } }) }).map((issue) => issue.id);
    expect(ids([ev(2, 'reveal', { seat: 4 })])).toContain('reveal-checks-4');
    expect(ids([ev(2, 'reveal', { seat: 4 }), ev(2, 'announced_check', { seat: 4, target: 1, value: 'red' })]).some((id) => id.startsWith('reveal-'))).toBe(false);
    expect(ids([ev(2, 'reveal', { seat: 5 })]).some((id) => id.startsWith('reveal-'))).toBe(false);
  });

  it('reads who voted «поднять» at the table', () => {
    expect(tableVotersOf([ev(2, 'table_vote', { seat: 3 }), ev(2, 'table_vote', { seat: 5 }), ev(2, 'table_vote_removed', { seat: 3 })] as any)).toEqual([5]);
  });

  it('lists what the judge changed and undoes each change', () => {
    const base = { protocol: protocol(), results: results() };
    const current = {
      protocol: { ...protocol(), winner_team: 'red', votes: [withBallots(dayOne as any, { 1: 4, 2: 7, 3: 7, 4: 7, 6: 7, 8: 7, 9: 7, 10: 7, 7: 4 })] },
      results: results({ 3: { role: 'mafia', regular_fouls: 2 } }),
    };
    const changes = computeChanges(base as any, current as any);
    expect(changes.map((change) => change.key).sort()).toEqual(['regular_fouls-3', 'role-3', 'round-1:1', 'winner']);
    const role = changes.find((change) => change.key === 'role-3')!;
    expect(role.was).toBe('Мирный');
    expect(role.now).toBe('Мафия');
    let state = current as any;
    for (const change of changes) state = change.revert(state);
    expect(computeChanges(base as any, state)).toEqual([]);
    expect(state.protocol.votes[0].vote_counts).toEqual({ 7: 8, 4: 1 });
  });
});

import { circleTitle, checkAnswerOf, roleAtTable } from '../components/crm/gameProtocol/protocolReview';

describe('protocol window: owner corrections 2026-10-26', () => {
  const exit = (round: number, seat: number, value: string) => ({ seq: ++seq, at: '', round, phase: '', kind: 'exit', seat, value });
  it('names the circles by the players at the table, with «после промаха» / «после попила»', () => {
    const events = [exit(1, 5, 'killed'), exit(2, 7, 'voted_day'), exit(2, 3, 'killed'), exit(3, 8, 'voted_day'), exit(4, 1, 'voted_day'), exit(4, 2, 'voted_day'), exit(4, 9, 'killed')];
    expect([0, 1, 2, 3, 4].map((index) => circleTitle(index, { events } as any))).toEqual(['Нулевой день', 'Девятка', 'Семёрка', 'Шестёрка после промаха', 'Угадайка после попила с подъёмом']);
    expect(circleTitle(2, { events: [exit(1, 5, 'killed'), exit(2, 3, 'killed')] } as any)).toBe('Восьмёрка после попила посидеть');
    expect(circleTitle(2, { events: [] } as any)).toBe('Круг 2');
  });
  it('the check answer follows the real role', () => {
    expect([checkAnswerOf('sheriff', 'don'), checkAnswerOf('sheriff', 'citizen'), checkAnswerOf('don', 'sheriff'), checkAnswerOf('don', 'mafia')]).toEqual(['black', 'red', 'sheriff', 'not_sheriff']);
  });
  it('a sheriff voted out by day does not check that night', () => {
    const protocolOf = { events: [exit(4, 5, 'voted_day')] } as any;
    expect(roleAtTable(protocolOf, results(), 'sheriff', 3)).toBe(false);
    expect(roleAtTable(protocolOf, results(), 'sheriff', 2)).toBe(true);
  });
  it('a black killed by his own team needs no death protocol', () => {
    const issues = computeIssues({ protocol: protocol({ events: [...voteEvents(), ev(1, 'death_protocol', { seat: 5 })] }), results: results({ 7: { exit_type: 'killed' }, 5: { exit_type: 'killed' } }) });
    expect(issues.map((issue) => issue.id)).not.toContain('death-7');
    expect(issues.map((issue) => issue.id)).toContain('death-5');
  });
});
