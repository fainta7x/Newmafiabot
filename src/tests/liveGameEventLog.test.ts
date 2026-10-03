import { describe, expect, it } from 'vitest';
import { appendLiveGameEvents, deriveLiveGameEvents, type LiveEventSnapshot } from '../lib/liveGameEventLog';
import { sanitizeLiveGameEvents, MAX_LIVE_GAME_EVENTS } from '../shared/liveGameEvents';
import { liveEvidenceSignature, updateLiveProtocolEvidence } from '../lib/liveClubSession';

const players = (patch: Record<number, Record<string, unknown>> = {}) =>
  Array.from({ length: 10 }, (_, index) => ({ slot_num: index + 1, alive: true, fouls: 0, minor_tech_fouls: 0, major_tech_fouls: 0, ppk: false, exit_reason: 'alive', ...(patch[index + 1] || {}) }));

const snapshot = (patch: Partial<LiveEventSnapshot> = {}): LiveEventSnapshot => ({
  phase: 'day_speeches', roundNumber: 2, nightSubPhase: 'intro', postNightStage: 'none', votingStage: 'setup',
  nominations: [], nominationsMap: {}, activeSpeakerSlot: null, votesByPlayer: {}, votingRounds: [], activeVotingRoundIndex: 0,
  activePlayers: players(), protocolMarkers: { firstKilledSlot: null, zeroRoundVotedSlot: null, bestMoveSeats: [] },
  ...patch,
});

const kinds = (events: Array<{ kind: string }>) => events.map((event) => event.kind);

describe('live game chronology', () => {
  it('describes nothing without a previous snapshot', () => {
    expect(deriveLiveGameEvents(null, snapshot(), 1, 'now')).toEqual([]);
  });

  it('records a nomination with who made it, a speech start, fouls and an exit', () => {
    const before = snapshot();
    const after = snapshot({
      nominations: [4], nominationsMap: { 4: 1 }, activeSpeakerSlot: 2,
      activePlayers: players({ 3: { fouls: 1 }, 5: { alive: false, exit_reason: 'killed' } }),
    });
    const events = deriveLiveGameEvents(before, after, 10, '2026-10-03T12:00:00.000Z');
    expect(kinds(events)).toEqual(['nomination', 'speech_start', 'foul', 'exit']);
    expect(events[0]).toMatchObject({ seq: 10, seat: 4, by: 1, round: 2, phase: 'day_speeches' });
    expect(events[1]).toMatchObject({ seat: 2, value: 'day' });
    expect(events[2]).toMatchObject({ seat: 3, value: 1 });
    expect(events[3]).toMatchObject({ seat: 5, value: 'killed' });
  });

  it('records who voted for whom, a removed vote and the result of the round', () => {
    const before = snapshot({ phase: 'day_voting', votingStage: 'collecting', votingRounds: [{ round_number: 1, outcome: 'pending' }], votesByPlayer: { 1: 4, 2: 4 } });
    const after = snapshot({ phase: 'day_voting', votingStage: 'collecting', votingRounds: [{ round_number: 1, outcome: 'single_eliminated' }], votesByPlayer: { 1: 4, 3: 4 } });
    const events = deriveLiveGameEvents(before, after, 1, 'now');
    expect(events.filter((event) => event.kind === 'vote')).toEqual([expect.objectContaining({ seat: 3, target: 4, value: 1 })]);
    expect(events.filter((event) => event.kind === 'vote_removed')).toEqual([expect.objectContaining({ seat: 2, target: 4 })]);
    expect(events.find((event) => event.kind === 'vote_round_result')?.value).toBe('1:single_eliminated');
  });

  it('records the night: shot, Don and Sheriff checks, first killed and best move', () => {
    const before = snapshot({ phase: 'night', nightSubPhase: 'shooting' });
    const after = snapshot({
      phase: 'night', nightSubPhase: 'don', shotPlayerSlot: 6, donCheckSlot: 7, donCheckResult: false, sheriffCheckSlot: 8, sheriffCheckResult: 'Чёрный',
      protocolMarkers: { firstKilledSlot: 6, zeroRoundVotedSlot: null, bestMoveSource: 'first_killed', bestMoveSourceSlot: 6, bestMoveSeats: [1, 2, 3] } as any,
    });
    const events = deriveLiveGameEvents(before, after, 1, 'now');
    expect(kinds(events)).toEqual(['night_step', 'shot_target', 'don_check', 'sheriff_check', 'first_killed', 'best_move']);
    expect(events.find((event) => event.kind === 'don_check')).toMatchObject({ target: 7, value: 'not_sheriff' });
    expect(events.find((event) => event.kind === 'best_move')).toMatchObject({ seat: 6, value: '1,2,3' });
  });

  it('the evidence keeps a growing, numbered log and only changes its signature when something happened', () => {
    let evidence = updateLiveProtocolEvidence({ votes: [], shots: [] }, snapshot() as any, null);
    expect(evidence.events?.map((event) => event.kind)).toEqual(['game_start']);
    const signature = liveEvidenceSignature(evidence);
    const unchanged = updateLiveProtocolEvidence(evidence, snapshot() as any, snapshot() as any);
    expect(liveEvidenceSignature(unchanged)).toBe(signature);
    evidence = updateLiveProtocolEvidence(evidence, snapshot({ nominations: [4], nominationsMap: { 4: 1 } }) as any, snapshot() as any);
    expect(evidence.events?.map((event) => event.seq)).toEqual([1, 2]);
    expect(liveEvidenceSignature(evidence)).not.toBe(signature);
  });

  it('keeps the log inside its limit and sanitises what the server receives', () => {
    const many = Array.from({ length: MAX_LIVE_GAME_EVENTS + 5 }, (_, index) => ({ seq: index + 1, at: 'x', round: 1, phase: 'night', kind: 'shot_target' }));
    expect(appendLiveGameEvents([], many as any)).toHaveLength(MAX_LIVE_GAME_EVENTS);
    const cleaned = sanitizeLiveGameEvents([
      { kind: 'vote', seat: 3, target: 99, by: 'x', round: 2, phase: 'day_voting', at: '2026-10-03', value: 'a'.repeat(500), extra: 'nope' },
      { kind: '<script>' },
      { nothing: true },
      'junk',
    ]);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0]).toEqual({ seq: 1, at: '2026-10-03', round: 2, phase: 'day_voting', kind: 'vote', seat: 3, value: 'a'.repeat(120) });
    expect(cleaned[1].kind).toBe('script');
  });
});

import { describeLiveGameEvents } from '../lib/liveGameEventText';

describe('game log text', () => {
  it('turns events into readable Russian lines with names', () => {
    const names = (seat: number) => `#${seat} Игрок ${seat}`;
    const lines = describeLiveGameEvents([
      { seq: 1, at: '2026-10-03T12:00:00.000Z', round: 1, phase: 'zero_night', kind: 'game_start' },
      { seq: 2, at: '2026-10-03T12:01:00.000Z', round: 2, phase: 'day_speeches', kind: 'nomination', seat: 4, by: 1 },
      { seq: 3, at: '2026-10-03T12:02:00.000Z', round: 2, phase: 'day_voting', kind: 'vote', seat: 2, target: 4 },
      { seq: 4, at: '2026-10-03T12:03:00.000Z', round: 2, phase: 'night', kind: 'don_check', target: 7, value: 'not_sheriff' },
      { seq: 5, at: '2026-10-03T12:04:00.000Z', round: 2, phase: 'night', kind: 'exit', seat: 6, value: 'killed' },
    ], names);
    expect(lines.map((line) => line.text)).toEqual([
      'Игра началась',
      '#1 Игрок 1 выставил #4 Игрок 4',
      '#2 Игрок 2 голосует за #4 Игрок 4',
      'Дон проверил #7 Игрок 7: не Шериф',
      '#6 Игрок 6 выбыл (убит)',
    ]);
    expect(lines[0].heading).toBe(true);
    expect(lines[1].heading).toBe(false);
  });
});
