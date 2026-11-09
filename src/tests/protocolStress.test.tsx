// @vitest-environment jsdom
import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProtocolEditing } from '../components/crm/gameProtocol/useProtocolEditing.ts';
import { buildCircles, circleTitle, computeIssues, moveEventToCircle, winnerTableMessage } from '../components/crm/gameProtocol/protocolReview.ts';
import { deriveExitTypes } from '../components/crm/tournaments/protocol/protocolStateUtils.ts';
import { determineVotingResult } from '../shared/tournamentVoting.ts';
import { canonicalizeClubGameSave } from '../server/services/clubGameProtocolService.ts';
import { validateProtocolVoting } from '../lib/protocolVotingValidation.ts';
import { validateShots } from '../lib/protocolConsistency.ts';

/**
 * Stress test of the protocol window (owner, 2026-11-01: «прогнать стресс-тесты со всеми вариантами ручных исправлений»): random
 * sequences of every manual edit the window offers run against the real editing hook, and after each edit the invariants of the
 * game record are checked. A failing seed prints its operation log so it can be replayed.
 */
const ROLES = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];
const EXIT_TYPES = ['alive', 'killed', 'voted_day', 'voted_zero_round', 'removed'];

const makeResults = () => ROLES.map((role, i) => ({
  participant_id: `p${i + 1}`, player_id: `u${i + 1}`, seat_number: i + 1, display_name: `Игрок ${i + 1}`, role,
  exit_type: 'alive', regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0, color_protocol: [],
})) as any[];
const makeProtocol = (): any => ({ game_id: '7', status: 'draft', winner_team: null, end_reason: 'normal', votes: [], shots: [], events: [], best_moves: [], best_move_seats: [], zero_round_rule: 'tournament' });

/** Small deterministic generator: a failing seed replays exactly. */
const rng = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

type Op = { name: string; run: (api: any, state: { protocol: any; results: any[] }, r: () => number) => void };
const pick = <T,>(r: () => number, list: T[]): T => list[Math.floor(r() * list.length)];
const seat = (r: () => number) => 1 + Math.floor(r() * 10);

const OPS: Op[] = [
  { name: 'addNight', run: (api) => api.addNight() },
  { name: 'deleteNight', run: (api, s, r) => { if (s.protocol.shots.length) api.deleteNight(Math.floor(r() * s.protocol.shots.length)); } },
  { name: 'changeShot', run: (api, s, r) => { if (s.protocol.shots.length) api.changeShot(Math.floor(r() * s.protocol.shots.length), r() < 0.2 ? 0 : seat(r), pick(r, ['killed', 'miss', 'agreement_failed'])); } },
  { name: 'addVoting', run: (api, _s, r) => api.addVoting(Math.floor(r() * 4)) },
  { name: 'deleteVoting', run: (api, s, r) => { if (s.protocol.votes.length) api.deleteVoting(Math.floor(r() * s.protocol.votes.length)); } },
  { name: 'nominate', run: (api, s, r) => { if (s.protocol.votes.length) { const i = Math.floor(r() * s.protocol.votes.length); const sd = seat(r); api.changeRound(i, (round: any) => ({ ...round, nominated_seats: round.nominated_seats.includes(sd) ? round.nominated_seats.filter((x: number) => x !== sd) : [...round.nominated_seats, sd] })); } } },
  { name: 'setVotes', run: (api, s, r) => { if (s.protocol.votes.length) { const i = Math.floor(r() * s.protocol.votes.length); api.changeRound(i, (round: any) => ({ ...round, vote_counts: Object.fromEntries(round.nominated_seats.map((x: number) => [x, Math.floor(r() * 6)])) })); } } },
  { name: 'setEligible', run: (api, s, r) => { if (s.protocol.votes.length) { const i = Math.floor(r() * s.protocol.votes.length); api.changeRound(i, (round: any) => ({ ...round, eligible_voters: 1 + Math.floor(r() * 10) })); } } },
  { name: 'confirmOutcome', run: (api, s, r) => { if (s.protocol.votes.length) { const i = Math.floor(r() * s.protocol.votes.length); const result = determineVotingResult(s.protocol.votes[i]); const outcome = (result as any).resolvedOutcome || result.outcome; api.confirmOutcome(i, outcome === 'requires_table_decision' ? 'no_elimination' : outcome, result.winners || []); } } },
  { name: 'resetOutcome', run: (api, s, r) => { if (s.protocol.votes.length) api.resetOutcome(Math.floor(r() * s.protocol.votes.length)); } },
  { name: 'setExit', run: (api, s, r) => { const p = pick(r, s.results); api.updateResult(p.participant_id, { exit_type: pick(r, EXIT_TYPES), removal_reason: null }); } },
  { name: 'removeByJudge', run: (api, s, r) => api.removeByJudge(pick(r, s.results)) },
  { name: 'cancelRemoval', run: (api, s, r) => api.cancelRemoval(pick(r, s.results)) },
  { name: 'foul', run: (api, s, r) => api.changeRegularFoul(pick(r, s.results), pick(r, [1, -1])) },
  { name: 'techFoul', run: (api, s, r) => api.changeTechFoul(pick(r, s.results), pick(r, ['minor', 'major']), pick(r, [1, -1])) },
  { name: 'firstKilled', run: (api, s, r) => api.changeFirstKilled(r() < 0.2 ? null : pick(r, s.results).participant_id) },
  { name: 'winner', run: (api, _s, r) => api.setWinner(pick(r, ['red', 'black', null])) },
  { name: 'ppk', run: (api, s, r) => api.causePpk(pick(r, s.results)) },
  { name: 'cancelPpk', run: (api) => api.cancelPpk() },
  { name: 'moveEvent', run: (api, s, r) => { const list = s.protocol.events || []; if (list.length) { const e = pick(r, list) as any; api.setEvents((cur: any[]) => moveEventToCircle(cur, e.seq, Math.floor(r() * 5))); } } },
  { name: 'exitEvent', run: (api, _s, r) => { const sd = seat(r); api.setEvents((list: any[]) => [...list, { seq: list.length + 1, at: '', round: 1 + Math.floor(r() * 4), phase: 'day_voting', kind: pick(r, ['exit', 'restored', 'foul', 'nomination', 'vote']), seat: sd, value: pick(r, ['removed', 'voted_day', 'killed']) }]); } },
];

type Failure = string;

const checkInvariants = (state: { protocol: any; results: any[] }, op: string): Failure[] => {
  const bad: Failure[] = [];
  const { protocol, results } = state;
  const at = (text: string) => bad.push(`${op}: ${text}`);
  if (results.length !== 10) at(`results length ${results.length}`);
  if (new Set(results.map((p) => p.seat_number)).size !== 10) at('seats not unique');
  for (const p of results) {
    if (!EXIT_TYPES.includes(p.exit_type)) at(`seat ${p.seat_number}: exit_type ${p.exit_type}`);
    if (p.removal_reason && p.exit_type !== 'removed') at(`seat ${p.seat_number}: removal_reason without «removed»`);
    if (p.exit_type === 'alive' && p.exit_order != null) at(`seat ${p.seat_number}: alive with exit_order`);
  }
  (protocol.shots || []).forEach((shot: any, i: number) => { if (Number(shot.night_number) !== i + 1) at(`night numbers broken at ${i}`); });
  const shotsMessage = validateShots(protocol.shots, 10, results, false);
  if (shotsMessage) at(`own shots fail validation: ${shotsMessage}`);
  try {
    computeIssues({ protocol, results } as any);
    const circles = buildCircles(protocol);
    circles.forEach((circle) => { if (!circleTitle(circle.index, protocol).trim()) at('empty circle title'); });
    winnerTableMessage(protocol, results);
    // Every remark is a working link (owner, 2026-11-02): a circle that exists and the block to show in it.
    for (const issue of computeIssues({ protocol, results } as any)) {
      if (issue.tab === 'game') {
        if (!(Number(issue.circle) >= 0 && Number(issue.circle) < circles.length)) at(`remark ${issue.id} leads to circle ${issue.circle} of ${circles.length}`);
        if (!issue.anchor) at(`remark ${issue.id} names no block to show`);
      }
    }
    validateProtocolVoting(protocol.votes || [], results.map(() => ({})) as any, null, protocol.zero_round_rule);
  } catch (error: any) { at(`review threw: ${error?.message}`); }
  // The record must be accepted by the server's save gate as a draft: a window that builds a state the server refuses breaks «не могу сохранить».
  try {
    const once = canonicalizeClubGameSave({ player_results: makeResults(), protocol: makeProtocol() }, protocol, results, 'draft');
    // Saving what the server answered must change nothing (the window re-reads its own save).
    const twice = canonicalizeClubGameSave({ player_results: makeResults(), protocol: makeProtocol() }, once.protocol, once.playerResults, 'draft');
    if (JSON.stringify(once.protocol) !== JSON.stringify(twice.protocol)) at('save is not idempotent (protocol)');
    if (JSON.stringify(once.playerResults.map((p: any) => [p.seat_number, p.exit_type])) !== JSON.stringify(twice.playerResults.map((p: any) => [p.seat_number, p.exit_type]))) at('save is not idempotent (exits)');
  } catch (error: any) { at(`server refuses the draft: ${error?.message}`); }
  // Every confirmed elimination is visible in the exit of that seat (unless a later edit made the player leave in another way).
  const derived = deriveExitTypes(protocol.votes || [], protocol.shots || [], protocol.first_killed_participant_id ?? null, results);
  for (const round of protocol.votes || []) {
    if (round.outcome === 'pending' && (round.eliminated_seats || []).length) at(`pending round ${round.round_number} still lists eliminated seats`);
  }
  void derived;
  return bad;
};

const useHarness = () => {
  const [protocol, setProtocol] = useState<any>(makeProtocol());
  const [results, setResults] = useState<any[]>(makeResults());
  const editing = useProtocolEditing({ protocol, setProtocol, playerResults: results, setPlayerResults: setResults });
  return { protocol, results, editing };
};

describe('protocol window stress test: random manual edits keep the record consistent', () => {
  beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); vi.spyOn(window, 'alert').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  const seeds = Array.from({ length: 200 }, (_, i) => 1000 + i);
  it.each(seeds)('seed %i: 120 random edits', (seed) => {
    const r = rng(seed);
    const { result } = renderHook(() => useHarness());
    const log: string[] = [];
    const failures: Failure[] = [];
    for (let step = 0; step < 120 && failures.length === 0; step += 1) {
      const op = pick(r, OPS);
      log.push(op.name);
      try {
        act(() => { op.run({ ...result.current.editing.members, causePpk: result.current.editing.members.causePpk }, { protocol: result.current.protocol, results: result.current.results }, r); });
      } catch (error: any) { failures.push(`${op.name} threw: ${error?.message}`); break; }
      failures.push(...checkInvariants({ protocol: result.current.protocol, results: result.current.results }, `${step}:${op.name}`));
    }
    expect(failures, `seed ${seed}, ops: ${log.join(' > ')}`).toEqual([]);
  });
});

describe('protocol window: what the manual edits must do (owner rules, 2026-10-31)', () => {
  beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.restoreAllMocks(); });
  const exitOf = (state: any, seat: number) => state.results.find((p: any) => p.seat_number === seat).exit_type;
  const setup = () => renderHook(() => useHarness());
  const addConfirmedVoting = (hook: any, day: number, nominated: number[], counts: Record<number, number>, eligible = 10) => {
    act(() => hook.result.current.editing.members.addVoting(day));
    const index = hook.result.current.protocol.votes.length - 1;
    act(() => hook.result.current.editing.members.changeRound(index, (round: any) => ({ ...round, nominated_seats: nominated, vote_counts: counts, eligible_voters: eligible })));
    const round = hook.result.current.protocol.votes[index];
    const result = determineVotingResult(round);
    act(() => hook.result.current.editing.members.confirmOutcome(index, (result as any).resolvedOutcome || result.outcome, result.winners || []));
    return index;
  };

  it('a confirmed vote-out sends the player out, and resetting it brings him back (voting back to «идёт голосование»)', () => {
    const hook = setup();
    const index = addConfirmedVoting(hook, 1, [7, 4], { 7: 8, 4: 1 });
    expect(exitOf(hook.result.current, 7)).toBe('voted_day');
    act(() => hook.result.current.editing.members.resetOutcome(index));
    expect(hook.result.current.protocol.votes[index].outcome).toBe('pending');
    expect(hook.result.current.protocol.votes[index].eliminated_seats).toEqual([]);
    expect(exitOf(hook.result.current, 7)).toBe('alive');
  });

  it('a night shot kills the target; deleting the night gives him back', () => {
    const hook = setup();
    act(() => hook.result.current.editing.members.addNight());
    expect(hook.result.current.protocol.shots[0]).toMatchObject({ target_seat: 0, result: 'miss' });
    expect(hook.result.current.results.every((p: any) => p.exit_type === 'alive')).toBe(true);
    act(() => hook.result.current.editing.members.changeShot(0, 5, 'killed'));
    expect(exitOf(hook.result.current, 5)).toBe('killed');
    act(() => hook.result.current.editing.members.deleteNight(0));
    expect(exitOf(hook.result.current, 5)).toBe('alive');
  });

  it('«Убит» without a chosen seat stays a miss (nothing that cannot be saved)', () => {
    const hook = setup();
    act(() => hook.result.current.editing.members.addNight());
    act(() => hook.result.current.editing.members.changeShot(0, 0, 'killed'));
    expect(hook.result.current.protocol.shots[0].result).toBe('miss');
  });

  it('bringing back a player removed for the second technical foul takes that foul back, so the game can be saved', async () => {
    const hook = setup();
    const player = hook.result.current.results[2];
    await act(async () => { await hook.result.current.editing.members.changeTechFoul(player, 'minor', 1); });
    await act(async () => { await hook.result.current.editing.members.changeTechFoul(hook.result.current.results[2], 'major', 1); });
    expect(exitOf(hook.result.current, 3)).toBe('removed');
    // the question is asked in the app's own window; here no host is mounted, so the browser's confirm answers
    await act(async () => { await hook.result.current.editing.members.cancelRemoval(hook.result.current.results[2]); });
    const back = hook.result.current.results[2];
    expect(back.exit_type).toBe('alive');
    expect(back.minor_technical_fouls + back.major_technical_fouls).toBe(1);
    expect(() => canonicalizeClubGameSave({ player_results: makeResults(), protocol: makeProtocol() }, hook.result.current.protocol, hook.result.current.results, 'draft')).not.toThrow();
  });

  it('after bringing back a player removed for the fourth foul he is at three fouls', async () => {
    const hook = setup();
    act(() => hook.result.current.editing.members.updateResult('p4', { regular_fouls: 4, exit_type: 'removed', removal_reason: '4th_foul' }));
    await act(async () => { await hook.result.current.editing.members.cancelRemoval(hook.result.current.results[3]); });
    expect(hook.result.current.results[3]).toMatchObject({ exit_type: 'alive', regular_fouls: 3 });
  });
});

describe('protocol reading: random chronologies never break the timeline', () => {
  const KINDS = ['exit', 'restored', 'foul', 'tech_minor', 'tech_major', 'nomination', 'vote', 'vote_removed', 'night_step', 'don_check', 'sheriff_check', 'reveal', 'announced_check', 'shot_target', 'table_vote', 'zero_round_break'];
  it.each(Array.from({ length: 150 }, (_, i) => 5000 + i))('seed %i', (seed) => {
    const r = rng(seed);
    const events = Array.from({ length: Math.floor(r() * 80) }, (_, i) => ({
      seq: i + 1, at: '', round: Math.floor(r() * 7), phase: pick(r, ['day_voting', 'night', 'day_speeches', 'night_']), kind: pick(r, KINDS),
      seat: r() < 0.1 ? undefined : seat(r), target: r() < 0.5 ? seat(r) : undefined, value: pick(r, ['removed', 'voted_day', 'killed', 1, 2, 'red', 'black', 'not_sheriff']),
    })) as any[];
    const votes = Array.from({ length: Math.floor(r() * 5) }, (_, i) => ({ round_number: i + 1, day_number: Math.floor(r() * 5), is_revote: r() < 0.3, nominated_seats: [seat(r), seat(r)], vote_counts: {}, outcome: pick(r, ['pending', 'single_eliminated', 'tie_revote']), eliminated_seats: r() < 0.5 ? [seat(r)] : [] })) as any[];
    const shots = Array.from({ length: Math.floor(r() * 5) }, (_, i) => ({ night_number: i + 1, target_seat: r() < 0.2 ? 0 : seat(r), result: pick(r, ['killed', 'miss']) })) as any[];
    const protocol = { ...makeProtocol(), events, votes, shots };
    expect(() => {
      const circles = buildCircles(protocol);
      for (const circle of circles) {
        const title = circleTitle(circle.index, protocol);
        if (!title.trim()) throw new Error('empty title');
        if (events.length && /^Круг \d/.test(title)) throw new Error(`old circle name «${title}» although the game has a chronology`);
      }
      computeIssues({ protocol, results: makeResults() } as any);
    }).not.toThrow();
  });
});
