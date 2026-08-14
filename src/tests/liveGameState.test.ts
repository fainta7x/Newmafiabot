import { describe, expect, it } from 'vitest';
import { buildLiveGameStateView } from '../lib/liveGameState';

const players = Array.from({ length: 10 }, (_, index) => ({
  slot_num: index + 1,
  nickname: `Игрок ${index + 1}`,
  role: index === 9 ? 'Дон' : index === 8 || index === 7 ? 'Мафия' : index === 6 ? 'Шериф' : 'Мирный',
  team: index >= 7 ? 'Чёрные' : 'Красные',
  alive: true,
  fouls: 0,
  minor_tech_fouls: 0,
  major_tech_fouls: 0,
  has_spoken_this_round: false,
  exit_reason: 'alive',
  eliminated_phase: '',
}));

const baseSnapshot = () => ({
  phase: 'day_speeches',
  roundNumber: 2,
  activePlayers: players.map((player) => ({ ...player })),
  activeSpeakerSlot: 2,
  timeLeft: 38,
  timerMax: 60,
  isTimerRunning: true,
  nominations: [4, 7],
  votingRounds: [],
  activeVotingRoundIndex: 0,
  votesByPlayer: {},
  votes: {},
  votingStage: 'setup',
  nightSubPhase: 'intro',
  postNightStage: 'none',
  protocolMarkers: {
    firstKilledSlot: null,
    zeroRoundVotedSlot: null,
    bestMoveSource: null,
    bestMoveSourceSlot: null,
    bestMoveSeats: [],
  },
  discipline: {
    players: Object.fromEntries(players.map((player) => [String(player.slot_num), {
      regularFouls: 0,
      minorTechFouls: 0,
      majorTechFouls: 0,
      isRemoved: false,
      removedReason: null,
      pendingAction: null,
      ppkCaused: false,
      has30SecPenalty: false,
    }])),
    isNextVotingCancelled: false,
    isPpk: false,
    ppkCulpritId: null,
  },
  nightLogs: [],
  savedAt: '15:30',
});

describe('current live game state', () => {
  it('summarizes the current speech and discipline warning', () => {
    const snapshot = baseSnapshot();
    snapshot.discipline.players['3'].regularFouls = 3;
    snapshot.discipline.players['3'].has30SecPenalty = true;

    const view = buildLiveGameStateView(snapshot)!;
    expect(view.phaseTitle).toBe('День 2 · речи');
    expect(view.phaseDetail).toBe('Сейчас говорит #2');
    expect(view.nextStep).toBe('Завершить речь #2');
    expect(view.timerText).toBe('38с · идёт');
    expect(view.warnings).toContain('#3: следующая речь 30 секунд');
    expect(view.aliveCount).toBe(10);
  });

  it('shows the active voting round and assigned votes', () => {
    const snapshot: any = baseSnapshot();
    snapshot.phase = 'day_voting';
    snapshot.activeSpeakerSlot = null;
    snapshot.isTimerRunning = false;
    snapshot.votingStage = 'collecting';
    snapshot.votingRounds = [{
      round_number: 2,
      nominated_seats: [4, 7],
      vote_counts: { 4: 6, 7: 4 },
      eligible_voters: 10,
    }];
    snapshot.votesByPlayer = { 1: 4, 2: 4, 3: 7 };

    const view = buildLiveGameStateView(snapshot)!;
    expect(view.phaseTitle).toBe('День 2 · голосование');
    expect(view.votingStage).toBe('Сбор голосов');
    expect(view.votingRound).toBe(2);
    expect(view.nominations).toEqual([4, 7]);
    expect(view.voteCounts).toEqual({ 4: 6, 7: 4 });
    expect(view.assignedVotes).toBe(3);
    expect(view.eligibleVoters).toBe(10);
    expect(view.nextStep).toBe('Зафиксировать голоса');
  });

  it('shows night targets, checks and protocol markers', () => {
    const snapshot: any = baseSnapshot();
    snapshot.phase = 'night';
    snapshot.nightSubPhase = 'sheriff';
    snapshot.activeSpeakerSlot = null;
    snapshot.shotPlayerSlot = 5;
    snapshot.donCheckSlot = 7;
    snapshot.donCheckResult = true;
    snapshot.sheriffCheckSlot = 9;
    snapshot.sheriffCheckResult = 'ЧЁРНЫЙ!';
    snapshot.protocolMarkers = {
      firstKilledSlot: 5,
      zeroRoundVotedSlot: 2,
      bestMoveSource: 'first_killed',
      bestMoveSourceSlot: 5,
      bestMoveSeats: [8, 9, 10],
    };

    const view = buildLiveGameStateView(snapshot)!;
    expect(view.phaseDetail).toBe('Проверка Шерифа');
    expect(view.shotPlayerSlot).toBe(5);
    expect(view.donCheck).toBe('#7 · Шериф');
    expect(view.sheriffCheck).toBe('#9 · ЧЁРНЫЙ!');
    expect(view.firstKilledSlot).toBe(5);
    expect(view.zeroRoundVotedSlot).toBe(2);
    expect(view.bestMove).toBe('первый убитый: #8, #9, #10');
  });

  it('keeps removed player state and cancellation visible', () => {
    const snapshot: any = baseSnapshot();
    snapshot.activePlayers[3].alive = false;
    snapshot.activePlayers[3].exit_reason = 'removed';
    snapshot.activePlayers[3].eliminated_phase = 'Удалён: 4-й фол (Д2)';
    snapshot.discipline.players['4'].regularFouls = 4;
    snapshot.discipline.players['4'].isRemoved = true;
    snapshot.discipline.players['4'].removedReason = '4th_foul';
    snapshot.discipline.isNextVotingCancelled = true;
    snapshot.nightLogs = [{ round: 2, log: 'Д2: игрок #4 удалён.' }];

    const view = buildLiveGameStateView(snapshot)!;
    const player4 = view.players.find((player) => player.seat === 4)!;
    expect(player4.alive).toBe(false);
    expect(player4.status).toContain('4-й фол');
    expect(player4.fouls).toBe(4);
    expect(view.aliveCount).toBe(9);
    expect(view.votingCancellationPending).toBe(true);
    expect(view.warnings).toContain('Ближайшее голосование отменено из-за удаления');
    expect(view.lastEvent).toBe('Д2: игрок #4 удалён.');
  });

  it('rejects malformed snapshots', () => {
    expect(buildLiveGameStateView(null)).toBeNull();
    expect(buildLiveGameStateView({ phase: 'night' })).toBeNull();
  });
});
