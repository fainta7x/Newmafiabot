/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LiveGameEngine from '../components/LiveGameEngine';
import { createInitialGameDiscipline } from '../lib/gameDiscipline';
import {
  deactivateTableDecisionSelection,
  getTableDecisionSelectionSnapshot,
  restoreTableDecisionSelection,
} from '../components/LiveGameEngine/tableDecisionSelectionStore';
import {
  cloneLiveSnapshot,
  type LiveSnapshot,
} from '../components/LiveGameEngine/engineStateModel';

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
  roundNumber: 2,
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
    round_number: 2,
    is_revote: true,
    nominated_seats: [2, 5],
    vote_counts: { 2: 5, 5: 5 },
    eligible_voters: 10,
    day_number: 1,
    parent_round_number: 1,
    parent_nominated_seats: [2, 5],
    parent_vote_counts: { 2: 5, 5: 5 },
    outcome: 'pending',
    eliminated_seats: [],
    table_leave_votes: null,
  }],
  activeVotingRoundIndex: 0,
  votesByPlayer: {},
  votes: { 2: 5, 5: 5 },
  votingStage: 'round_result',
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

const seat = (slot: number) => document.querySelector(`[data-seat="${slot}"]`) as HTMLElement | null;

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

describe('Live Game table-decision recovery', () => {
  it('persists exact raised-hand voter identities in cloned snapshots', () => {
    const source = tableDecisionSnapshot();
    delete source.tableDecisionSelectionKey;
    delete source.tableDecisionSelectedVoterSlots;
    restoreTableDecisionSelection('0:2:2-5', [1, 4, 8]);

    const cloned = cloneLiveSnapshot(source);

    expect(cloned.tableDecisionSelectionKey).toBe('0:2:2-5');
    expect(cloned.tableDecisionSelectedVoterSlots).toEqual([1, 4, 8]);
    expect(getTableDecisionSelectionSnapshot()).toEqual({
      key: '0:2:2-5',
      selectedVoterSlots: [1, 4, 8],
    });
  });

  it('restores the exact player cards selected for raise/leave after reload', async () => {
    renderRecovered(tableDecisionSnapshot());

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));

    expect(await screen.findByText('Поднять всех?')).toBeTruthy();
    await waitFor(() => {
      expect(seat(1)?.getAttribute('data-table-vote-selected')).toBe('true');
      expect(seat(4)?.getAttribute('data-table-vote-selected')).toBe('true');
      expect(seat(8)?.getAttribute('data-table-vote-selected')).toBe('true');
    });
    expect(seat(2)?.getAttribute('data-table-vote-selected')).toBeNull();
    expect(seat(5)?.getAttribute('data-table-vote-selected')).toBeNull();
    expect(screen.getByText('3/10')).toBeTruthy();

    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem('mafia_live_session') || '{}');
      expect(persisted.tableDecisionSelectionKey).toBe('0:2:2-5');
      expect(persisted.tableDecisionSelectedVoterSlots).toEqual([1, 4, 8]);
    });
  });

  it('keeps legacy recovery snapshots safe when exact voter identities are absent', async () => {
    const legacy = tableDecisionSnapshot();
    delete legacy.tableDecisionSelectionKey;
    delete legacy.tableDecisionSelectedVoterSlots;
    legacy.tableLeaveVotesInput = null;
    renderRecovered(legacy);

    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));

    expect(await screen.findByText('Поднять всех?')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('0/10')).toBeTruthy());
    for (const slot of [1, 2, 4, 5, 8]) {
      expect(seat(slot)?.getAttribute('data-table-vote-selected')).toBeNull();
    }
  });
});
