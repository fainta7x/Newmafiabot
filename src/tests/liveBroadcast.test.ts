import { describe, expect, it } from 'vitest';
import { buildLiveBroadcastState } from '../lib/liveBroadcast';

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
});
