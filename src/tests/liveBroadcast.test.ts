import { describe, expect, it } from 'vitest';
import { buildLiveBroadcastState, mergeBroadcastDayVotes, parseBroadcastTimeline } from '../lib/liveBroadcast';

const activePlayers = Array.from({ length: 10 }, (_, index) => ({
  slot_num: index + 1,
  nickname: `Игрок ${index + 1}`,
  role: index === 9 ? 'Дон' : index >= 7 ? 'Мафия' : index === 6 ? 'Шериф' : 'Мирный',
  team: index >= 7 ? 'Чёрные' : 'Красные',
  alive: true,
  fouls: 0,
  minor_tech_fouls: 0,
  major_tech_fouls: 0,
  exit_reason: 'alive',
  eliminated_phase: '',
}));

const snapshot = () => ({
  phase: 'day_speeches',
  roundNumber: 2,
  activePlayers: activePlayers.map((player) => ({ ...player })),
  activeSpeakerSlot: 4,
  timeLeft: 43,
  timerMax: 60,
  isTimerRunning: true,
  customTimerLabel: null,
  nominations: [7, 3, 9],
  nominationsMap: { 7: 1, 3: 2, 9: 4 },
  votingRounds: [],
  activeVotingRoundIndex: 0,
  votesByPlayer: {},
  votes: {},
  votingStage: 'setup',
  nightSubPhase: 'intro',
  postNightStage: 'none',
  protocolMarkers: {},
  discipline: { players: {}, isNextVotingCancelled: false, isPpk: false, ppkCulpritId: null },
  nightLogs: [],
});

const metadata = {
  gameId: 17,
  globalGameNumber: 238,
  tableName: 'Стол 1',
  players: activePlayers.map((player) => ({
    seat: player.slot_num,
    playerId: `player-${player.slot_num}`,
    nickname: player.nickname,
  })),
};

describe('live broadcast audience state', () => {
  it('keeps the exact nomination order and canonical player identity', () => {
    const state = buildLiveBroadcastState(snapshot(), metadata)!;

    expect(state.globalGameNumber).toBe(238);
    expect(state.players[0]).toMatchObject({ seat: 1, playerId: 'player-1', nickname: 'Игрок 1', role: 'Мирный' });
    expect(state.nominations).toEqual([
      { seat: 7, order: 1, nominatedBy: 1 },
      { seat: 3, order: 2, nominatedBy: 2 },
      { seat: 9, order: 3, nominatedBy: 4 },
    ]);
  });

  it('does not leak vote choices while the judge is still collecting them', () => {
    const source: any = snapshot();
    source.phase = 'day_voting';
    source.votingStage = 'collecting';
    source.votingRounds = [{
      round_number: 1,
      nominated_seats: [7, 3, 9],
      vote_counts: { 7: 3, 3: 3, 9: 4 },
      eligible_voters: 10,
      outcome: 'pending',
    }];
    source.votesByPlayer = { 1: 7, 2: 7, 3: 3, 4: 9 };

    const state = buildLiveBroadcastState(source, metadata)!;
    expect(state.vote).toMatchObject({ published: false, candidates: [7, 3, 9] });
    expect(state.vote?.counts).toEqual({});
    expect(state.vote?.assignments).toEqual({});
  });

  it('publishes the fixed voter-to-candidate map after the judge resolves the vote', () => {
    const source: any = snapshot();
    source.phase = 'day_voting';
    source.votingStage = 'round_result';
    source.votingRounds = [{
      round_number: 2,
      is_revote: true,
      nominated_seats: [7, 3],
      vote_counts: { 7: 5, 3: 5 },
      eligible_voters: 10,
      outcome: 'pending',
    }];
    source.votesByPlayer = { 1: 7, 2: 7, 3: 3, 4: 3, 5: 7, 6: 3, 7: 7, 8: 3, 9: 7, 10: 3 };

    const state = buildLiveBroadcastState(source, metadata)!;
    expect(state.vote).toMatchObject({ published: true, roundNumber: 2, isRevote: true });
    expect(state.vote?.counts).toEqual({ 7: 5, 3: 5 });
    expect(state.vote?.assignments).toEqual(source.votesByPlayer);
  });

  it('highlights only the candidates advancing from a fixed split', () => {
    const source: any = snapshot();
    source.phase = 'day_voting';
    source.votingStage = 'round_result';
    source.votingRounds = [{
      round_number: 1,
      nominated_seats: [7, 3, 9],
      vote_counts: { 7: 4, 3: 4, 9: 2 },
      eligible_voters: 10,
      outcome: 'pending',
    }];
    source.votesByPlayer = { 1: 7, 2: 7, 3: 7, 4: 7, 5: 3, 6: 3, 7: 3, 8: 3, 9: 9, 10: 9 };

    const state = buildLiveBroadcastState(source, metadata)!;
    expect(state.vote?.candidates).toEqual([7, 3, 9]);
    expect(state.vote?.highlightedCandidates).toEqual([7, 3]);
  });

  it('keeps roles visible while distinguishing killed, voted and removed players', () => {
    const source: any = snapshot();
    source.activePlayers[1] = { ...source.activePlayers[1], alive: false, exit_reason: 'killed', role: 'Мафия' };
    source.activePlayers[2] = { ...source.activePlayers[2], alive: false, exit_reason: 'voted_day' };
    source.activePlayers[3] = { ...source.activePlayers[3], alive: false, exit_reason: 'removed', kick: true };

    const state = buildLiveBroadcastState(source, metadata)!;
    expect(state.players[1]).toMatchObject({ role: 'Мафия', alive: false, statusKind: 'killed' });
    expect(state.players[2].statusKind).toBe('voted');
    expect(state.players[3].statusKind).toBe('removed');
  });

  it('shows tonight\'s shot and checks only during the night', () => {
    const night = buildLiveBroadcastState({
      ...snapshot(),
      phase: 'night',
      shotPlayerSlot: 4,
      donCheckSlot: 7,
      donCheckResult: true,
      sheriffCheckSlot: 10,
      sheriffCheckResult: 'ЧЁРНЫЙ!',
    }, metadata)!;
    expect(night.night).toEqual({
      shotSeat: 4,
      donCheck: { seat: 7, isSheriff: true },
      sheriffCheck: { seat: 10, isBlack: true },
    });

    const day = buildLiveBroadcastState({ ...snapshot(), shotPlayerSlot: 4, donCheckSlot: 7 }, metadata)!;
    expect(day.night).toBeNull();
  });

  it('publishes the first killed player\'s best move', () => {
    const state = buildLiveBroadcastState({
      ...snapshot(),
      protocolMarkers: { firstKilledSlot: 2, bestMoveSource: 'first_killed', bestMoveSeats: [8, 9, 10] },
    }, metadata)!;
    expect(state.bestMove).toEqual({ bySeat: 2, seats: [8, 9, 10] });
  });

  it('builds «Ход игры» from the engine log and adds the current night live', () => {
    const nightLogs = [
      { round: 1, log: 'Д1: в нулевом круге выставлена только одна кандидатура #3; голосование не проводится, наступает ночь.' },
      { round: 1, log: 'Н1: выстрел в #2 — убит. Дон: #3 — не Шериф. Шериф: #8 — ЧЁРНЫЙ!.' },
      { round: 2, log: 'Д2: заголосован игрок #5; перед ночью — прощальная минута.' },
      { round: 2, log: 'Н2: выстрел в #1 — промах. Дон: #6 — Шериф. Шериф: #4 — Красный.' },
      { round: 3, log: 'Д3: 6/8 за уход; спорные #3, #7 заголосованы. Прощальные минуты: #3, #7.' },
      { round: 4, log: 'Д4: 3/6 за уход; большинство не набрано, все остаются.' },
    ];
    expect(parseBroadcastTimeline(nightLogs)).toEqual([
      { kind: 'day', round: 1, left: [], note: 'single' },
      { kind: 'night', round: 1, current: false, shotSeat: 2, killed: true, donCheck: { seat: 3, isSheriff: false }, sheriffCheck: { seat: 8, isBlack: true } },
      { kind: 'day', round: 2, left: [5], note: 'voted' },
      { kind: 'night', round: 2, current: false, shotSeat: 1, killed: false, donCheck: { seat: 6, isSheriff: true }, sheriffCheck: { seat: 4, isBlack: false } },
      { kind: 'day', round: 3, left: [3, 7], note: 'table' },
      { kind: 'day', round: 4, left: [], note: 'stay' },
    ]);

    const live = buildLiveBroadcastState({
      ...snapshot(), phase: 'night', roundNumber: 2, nightLogs: nightLogs.slice(0, 2), shotPlayerSlot: 6,
    }, metadata)!;
    expect(live.timeline?.at(-1)).toMatchObject({ kind: 'night', current: true, shotSeat: 6 });

    // After the night is resolved the farewell still runs under phase «night»: no duplicate row.
    const resolved = buildLiveBroadcastState({
      ...snapshot(), phase: 'night', roundNumber: 1, nightLogs: nightLogs.slice(0, 2), shotPlayerSlot: 2,
    }, metadata)!;
    expect(resolved.timeline?.filter((entry) => entry.kind === 'night' && entry.round === 1)).toHaveLength(1);
    expect(resolved.timeline?.some((entry) => entry.kind === 'night' && entry.current)).toBe(false);
  });

  it('remembers each day\'s last fixed vote so the stream shows by whose hands a player left', () => {
    const fixed = (round: number, assignments: Record<number, number>) => ({
      roundNumber: round,
      vote: { roundNumber: 1, isRevote: false, candidates: [], highlightedCandidates: [], published: true, counts: {}, assignments, outcome: null },
    });
    let votes = mergeBroadcastDayVotes([], { roundNumber: 2, vote: null });
    expect(votes).toEqual([]);
    votes = mergeBroadcastDayVotes(votes, fixed(2, { 1: 5, 3: 5 }));
    votes = mergeBroadcastDayVotes(votes, fixed(2, { 1: 5, 3: 5, 4: 5 }));
    votes = mergeBroadcastDayVotes(votes, fixed(3, { 2: 7 }));
    expect(votes).toEqual([
      { round: 2, assignments: { 1: 5, 3: 5, 4: 5 } },
      { round: 3, assignments: { 2: 7 } },
    ]);
  });
});
