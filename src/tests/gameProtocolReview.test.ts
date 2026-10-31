import { describe, expect, it } from 'vitest';
import { tableVotersOf, buildCircles, checksOf, computeChanges, computeIssues, withoutCancelledExits, exitsOf as exitsOfCircle, winnerTableMessage, exitsOf, nominatorsOf, roundBallots, roundChain, withBallots } from '../components/crm/gameProtocol/protocolReview';

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
    expect(circles.map((circle) => circle.title)).toEqual(['Нулевой круг', 'Девятка']);
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
    // (this fixture is a mid-game table with a stand-in winner: the «winner-table» check is covered by its own tests below)
    expect(issues.filter((issue) => issue.severity === 'error' && issue.id !== 'winner-table')).toEqual([]);
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
    expect([0, 1, 2, 3, 4].map((index) => circleTitle(index, { events } as any))).toEqual(['Нулевой круг', 'Девятка', 'Семёрка', 'Шестёрка после промаха', 'Угадайка после попила с подъёмом']);
    expect(circleTitle(2, { events: [exit(1, 5, 'killed'), exit(2, 3, 'killed')] } as any)).toBe('Восьмёрка после оставления при 9');
    // Game №20 of 2026-10-23: №9 killed, №4 voted out, a miss, a split with everybody staying, another miss (owner, 2026-10-27).
    const game20 = { events: [exit(1, 9, 'killed'), exit(2, 4, 'voted_day')] } as any;
    expect([2, 3].map((index) => circleTitle(index, game20))).toEqual(['Восьмёрка после промаха', 'Восьмёрка после оставления при 8 и двух промахов']);
    // The journal still holds the stray vote that put №3 Богданчик out; the corrected protocol says everybody stayed.
    const corrected = {
      events: [exit(1, 9, 'killed'), exit(2, 4, 'voted_day'), exit(3, 3, 'voted_day')],
      votes: [
        { round_number: 4, day_number: 1, is_revote: true, outcome: 'single_eliminated', eliminated_seats: [4] },
        { round_number: 5, day_number: 2, is_revote: false, outcome: 'tie_revote', eliminated_seats: [] },
        { round_number: 6, day_number: 2, is_revote: true, outcome: 'no_elimination', eliminated_seats: [] },
      ],
      shots: [{ night_number: 1, target_seat: 9, result: 'killed' }, { night_number: 2, target_seat: 0, result: 'miss' }, { night_number: 3, target_seat: 0, result: 'agreement_failed' }],
    } as any;
    expect([1, 2, 3].map((index) => circleTitle(index, corrected))).toEqual(['Девятка', 'Восьмёрка после промаха', 'Восьмёрка после оставления при 8 и двух промахов']);
    // A day with nobody nominated is an «оставление» too (owner, 2026-10-27).
    expect(circleTitle(3, { ...corrected, votes: corrected.votes.slice(0, 1) })).toBe('Восьмёрка после оставления при 8 и двух промахов');
    expect(circleTitle(3, { ...corrected, shots: [corrected.shots[0], corrected.shots[1], { night_number: 3, target_seat: 7, result: 'killed' }] })).toBe('Семёрка после оставления при 8');
    // A judge's removal is placed in time only by the chronology.
    expect(circleTitle(3, { ...corrected, events: [...corrected.events, exit(3, 6, 'removed')] })).toBe('Семёрка после оставления при 8 и двух промахов');
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

describe('the winner must follow from the table (game 24, 2026-10-30)', () => {
  // roles: black = seats 4 (don), 7, 8 (mafia)
  const gone = (...seats: number[]) => Object.fromEntries(seats.map((seat) => [seat, { exit_type: 'voted_day' }]));
  it('black «won» with three reds and two blacks left: the game goes on', () => {
    const message = winnerTableMessage({ winner_team: 'black', end_reason: 'normal' }, results(gone(1, 2, 3, 6, 8)));
    expect(message).toMatch(/3 красных и 2 чёрных/);
    expect(message).toMatch(/игра продолжается/);
  });
  it('accepts black with an equal count and a majority, and red with no black left', () => {
    expect(winnerTableMessage({ winner_team: 'black', end_reason: 'normal' }, results(gone(1, 2, 3, 6, 9, 10)))).toBeNull();
    expect(winnerTableMessage({ winner_team: 'red', end_reason: 'normal' }, results(gone(4, 7, 8)))).toBeNull();
  });
  it('flags a red win while blacks are alive, and a missing winner when the table already decided', () => {
    expect(winnerTableMessage({ winner_team: 'red', end_reason: 'normal' }, results())).toMatch(/не сходится со столом/);
    expect(winnerTableMessage({ winner_team: null, end_reason: 'normal' }, results(gone(1, 2, 3, 5, 6, 9, 10)))).toMatch(/побеждают чёрные/);
  });
  it('leaves a PPK and incomplete records alone, and reaches the issue list', () => {
    expect(winnerTableMessage({ winner_team: 'black', end_reason: 'ppk' }, results())).toBeNull();
    expect(winnerTableMessage({ winner_team: 'black', end_reason: 'normal' }, results({ 1: { role: null, exit_type: null } }))).toBeNull();
    const state = { protocol: { winner_team: 'black', end_reason: 'normal', votes: [], shots: [], events: [] }, results: results(gone(1, 2, 3, 6, 8)) } as any;
    expect(computeIssues(state).some((issue) => issue.id === 'winner-table')).toBe(true);
  });
});

describe('a removal taken back leaves no trace (owner, 2026-10-31: №5 and №6 were removed by mistake)', () => {
  it('a cancelled exit is struck out of the circle as if it never happened', () => {
    const events = [ev(2, 'exit', { seat: 5, value: 'removed' }), ev(2, 'exit', { seat: 6, value: 'removed' }), ev(2, 'restored', { seat: 5 }), ev(2, 'restored', { seat: 6 }), ev(2, 'exit', { seat: 7, value: 'voted_day' })] as any[];
    expect(exitsOfCircle(events)).toEqual([{ seat: 7, reason: 'voted_day' }]);
  });
  it('a removal cancelled in a later circle disappears from the earlier circle too', () => {
    const events = [ev(2, 'exit', { seat: 5, value: 'removed' }), ev(2, 'exit', { seat: 7, value: 'voted_day' }), ev(3, 'restored', { seat: 5 })] as any[];
    expect(withoutCancelledExits(events).map((event: any) => `${event.kind}:${event.seat}`)).toEqual(['exit:7']);
    const circles = buildCircles({ votes: [], shots: [], events } as any);
    expect(circles.flatMap((circle) => exitsOfCircle(circle.events))).toEqual([{ seat: 7, reason: 'voted_day' }]);
  });
  it('an exit that was never cancelled stays', () => {
    const events = [ev(2, 'exit', { seat: 5, value: 'removed' })] as any[];
    expect(withoutCancelledExits(events)).toBe(events);
  });
});
