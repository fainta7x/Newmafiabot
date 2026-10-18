/** @vitest-environment jsdom */
/** «Вскрытие» must be reachable during the game, not only from the hidden judge toolbar (owner, 2026-10-18). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const baseSnapshot = (patch: Record<string, unknown> = {}) => {
  const base = tableDecisionSnapshot();
  return {
    ...base,
    phase: 'day_speeches',
    roundNumber: 2,
    dayStarterSlot: 1,
    nominations: [],
    nominationsMap: {},
    votingRounds: [],
    votingStage: 'setup',
    votes: {},
    activeSpeakerSlot: 1,
    timeLeft: 40,
    timerMax: 60,
    isTimerRunning: false,
    activePlayers: base.activePlayers.map((player: any) => ({ ...player, has_spoken_this_round: false })),
    ...patch,
  };
};

const restore = async (snapshot: Record<string, unknown>) => {
  renderRecovered(snapshot);
  fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
  await screen.findByTestId('live-judge-hud');
};

const press = (code: string, init: Record<string, unknown> = {}) => fireEvent.keyDown(document.body, { code, ...init });

describe('Live Game «Вскрытие» entry', () => {
  it('the player sheet marks a black player as revealed and records announced checks with one tap each', async () => {
    await restore(baseSnapshot());
    press('Digit9');
    press('Digit0'); // the player sheet
    fireEvent.click(await screen.findByTestId('live-player-reveal'));
    expect(await screen.findByTestId('live-player-reveal-remove')).toBeTruthy();
    fireEvent.click(screen.getByTestId('live-player-reveal-red-2'));
    await waitFor(() => expect(screen.getByTestId('live-player-reveal-red-2').getAttribute('aria-pressed')).toBe('true'));
    // the same player announced as black instead: the colour changes, there is still one check
    fireEvent.click(screen.getByTestId('live-player-reveal-black-2'));
    await waitFor(() => expect(screen.getByTestId('live-player-reveal-black-2').getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByTestId('live-player-reveal-red-2').getAttribute('aria-pressed')).toBe('false');
    // a second tap on the same colour takes the check back
    fireEvent.click(screen.getByTestId('live-player-reveal-black-2'));
    await waitFor(() => expect(screen.getByTestId('live-player-reveal-black-2').getAttribute('aria-pressed')).toBe('false'));
    // the judge panel opened by V shows the same record
    fireEvent.click(screen.getByTestId('live-player-reveal-red-5'));
    fireEvent.click(screen.getByTestId('live-player-actions-close'));
    press('KeyV');
    const card = await screen.findByTestId('live-reveal-card-9');
    expect(card.textContent).toContain('#5');
  });
});
