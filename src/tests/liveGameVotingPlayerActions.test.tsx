/** @vitest-environment jsdom */
/** Fouls and the quick zero-round split stay reachable while a tap on a seat casts a vote (owner, 2026-10-17). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LiveGameEngine from '../components/LiveGameEngine';
import { createInitialGameDiscipline } from '../lib/gameDiscipline';
import { deactivateTableDecisionSelection } from '../components/LiveGameEngine/tableDecisionSelectionStore';
import type { LiveSnapshot } from '../components/LiveGameEngine/engineStateModel';

const activePlayers = Array.from({ length: 10 }, (_, index) => {
  const slot = index + 1;
  const black = slot >= 8;
  const role = slot === 10 ? 'Дон' : slot >= 8 ? 'Мафия' : slot === 7 ? 'Шериф' : 'Мирный';
  return {
    slot_num: slot,
    user_id: slot,
    nickname: `Игрок ${slot}`,
    role,
    team: black ? 'Чёрные' : 'Красные',
    fouls: 0,
    minor_tech_fouls: 0,
    major_tech_fouls: 0,
    removal_reason: null,
    alive: true,
    nominated_this_round: false,
    has_spoken_this_round: true,
    mute_this_round: false,
    is_pu: false,
    best_move_guesses: [],
    kick: false,
    ppk: false,
    bonus_points: 0,
    lh_points: 0,
    will_protocol_points: 0,
    will_opinion_points: 0,
    dc_points: 0,
    eliminated_phase: '',
    has_foul_penalty: false,
    exit_reason: 'alive',
  };
}) as any;

const tableDecisionSnapshot = (): LiveSnapshot & { savedAt: string } => ({
  activePlayers,
  nominations: [2, 5],
  nominationsMap: {},
  phase: 'day_voting',
  roundNumber: 1,
  dayStarterSlot: 1,
  nightSubPhase: 'intro',
  postNightStage: 'none',
  protocolMarkers: {
    firstKilledSlot: null,
    zeroRoundVotedSlot: null,
    bestMoveSource: null,
    bestMoveSourceSlot: null,
    bestMoveSeats: [],
  },
  activeBestMoveSource: null,
  activeBestMoveSlot: null,
  pendingBestMoveSeats: [],
  bestMoveDeadlineMs: null,
  votingRounds: [{
    round_number: 1,
    is_revote: false,
    nominated_seats: [2, 5],
    vote_counts: { 2: 0, 5: 0 },
    eligible_voters: 10,
    day_number: 1,
    parent_round_number: null,
    parent_nominated_seats: [2, 5],
    parent_vote_counts: { 2: 5, 5: 5 },
    outcome: 'pending',
    eliminated_seats: [],
    table_leave_votes: null,
  }],
  activeVotingRoundIndex: 0,
  votesByPlayer: {},
  votes: {},
  votingStage: 'collecting',
  revoteSpeakerIndex: 0,
  tableLeaveVotesInput: 3,
  tableDecisionSelectionKey: '0:2:2-5',
  tableDecisionSelectedVoterSlots: [1, 4, 8],
  currentVotingNomineeIndex: 0,
  activeSpeakerSlot: null,
  customTimerLabel: null,
  timeLeft: 60,
  timerMax: 60,
  isTimerRunning: false,
  zeroNightSubPhase: null,
  zeroNightMusicState: 'pending',
  shotPlayerSlot: null,
  donCheckSlot: null,
  donCheckResult: null,
  sheriffCheckSlot: null,
  sheriffCheckResult: null,
  nightLogs: [],
  votingFarewellQueue: [],
  votingFarewellIndex: 0,
  discipline: createInitialGameDiscipline(
    activePlayers.map((player: any) => ({
      id: String(player.slot_num),
      team: player.team === 'Чёрные' ? 'black' : 'red',
    })),
  ),
  savedAt: '13:00',
});

const renderRecovered = (snapshot: Record<string, unknown>) => {
  localStorage.setItem('mafia_live_session', JSON.stringify(snapshot));
  render(
    <LiveGameEngine
      players={[]}
      initialJudgeId={777}
      onGameFinished={vi.fn()}
      onCancel={vi.fn()}
      onPhaseChange={vi.fn()}
    />,
  );
};

const seat = (slot: number) => document.querySelector(`.live-seat-card[data-seat="${slot}"]`) as HTMLElement | null;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  deactivateTableDecisionSelection();
});

afterEach(() => {
  cleanup();
  deactivateTableDecisionSelection();
  localStorage.clear();
  sessionStorage.clear();
});

describe('Live Game voting: player actions and zero-round split', () => {
  const restore = async () => {
    renderRecovered(tableDecisionSnapshot());
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    await screen.findByText(/Кто против/);
  };

  it('opens the player action sheet with fouls on a long press without casting a vote', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await restore();
      fireEvent.pointerDown(seat(6)!, { button: 0, clientX: 10, clientY: 10 });
      await vi.advanceTimersByTimeAsync(700);
      fireEvent.pointerUp(seat(6)!);
      fireEvent.click(seat(6)!);
      expect(await screen.findByTestId('live-player-add-regular-foul')).toBeTruthy();
      expect(screen.queryByTestId('seat-vote-target-6')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a plain tap on a seat still votes', async () => {
    await restore();
    fireEvent.pointerDown(seat(6)!, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(seat(6)!);
    fireEvent.click(seat(6)!);
    expect(await screen.findByTestId('seat-vote-target-6')).toBeTruthy();
    expect(screen.queryByTestId('live-player-add-regular-foul')).toBeNull();
  });

  it('offers «Попил» in the zero round at a full table', async () => {
    await restore();
    expect(screen.getByTestId('live-quick-split')).toBeTruthy();
  });
});
