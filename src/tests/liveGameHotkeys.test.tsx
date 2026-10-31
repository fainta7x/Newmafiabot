/** @vitest-environment jsdom */
/** Desktop keyboard control of the Live Game (owner, 2026-10-17). */
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

const votingSnapshot = () => baseSnapshot({
  phase: 'day_voting',
  roundNumber: 2,
  activeSpeakerSlot: null,
  nominations: [3, 7],
  nominationsMap: { 1: 3, 2: 7 },
  votingStage: 'collecting',
  votingRounds: [{
    round_number: 1, is_revote: false, nominated_seats: [3, 7], vote_counts: { 3: 0, 7: 0 }, eligible_voters: 10, day_number: 1,
    parent_round_number: null, parent_nominated_seats: [], parent_vote_counts: {}, outcome: 'pending', eliminated_seats: [], table_leave_votes: null,
  }],
});

const restore = async (snapshot: Record<string, unknown>) => {
  renderRecovered(snapshot);
  fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
  await screen.findByTestId('live-judge-hud');
};

const press = (code: string, init: Record<string, unknown> = {}) => fireEvent.keyDown(document.body, { code, ...init });
const fouls = (slot: number) => document.querySelector(`[data-testid="live-seat-discipline-${slot}"]`);

describe('Live Game keyboard control', () => {
  it('a digit picks the seat and shows the action menu; a hand-mirrored key gives the foul', async () => {
    await restore(baseSnapshot());
    press('Digit3');
    expect(await screen.findByTestId('live-hotkey-menu')).toBeTruthy();
    expect(document.querySelector('.live-seat-card[data-seat="3"]')?.getAttribute('data-hotkey-cursor')).toBe('true');
    press('KeyJ');
    await waitFor(() => expect(fouls(3)).not.toBeNull());
    expect(screen.queryByTestId('live-hotkey-menu')).toBeNull();
    // the left-hand twin of the same action
    press('Digit4');
    press('KeyF');
    await waitFor(() => expect(fouls(4)).not.toBeNull());
  });

  it('the second digit is the action too: 2 is the foul, 0 is the tenth seat', async () => {
    await restore(baseSnapshot());
    press('Digit0');
    expect(screen.getByTestId('live-hotkey-menu').textContent).toContain('#10');
    press('Digit2');
    await waitFor(() => expect(fouls(10)).not.toBeNull());
  });

  it('exposes a candidate during the speech with 1 as the action', async () => {
    await restore(baseSnapshot());
    press('Digit5');
    press('KeyD');
    await waitFor(() => expect(document.querySelector('.live-seat-card[data-seat="5"]')?.getAttribute('data-nominated')).toBe('true'));
  });

  it('arrows move the cursor and Escape clears it', async () => {
    await restore(baseSnapshot());
    press('ArrowRight');
    const first = document.querySelector('[data-hotkey-cursor="true"]');
    expect(first).not.toBeNull();
    press('ArrowRight');
    const second = document.querySelector('[data-hotkey-cursor="true"]');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    press('Escape');
    expect(document.querySelector('[data-hotkey-cursor="true"]')).toBeNull();
    expect(screen.queryByTestId('live-hotkey-menu')).toBeNull();
  });

  it('in a voting a plain digit is the vote itself and Shift+digit opens the menu', async () => {
    await restore(votingSnapshot());
    press('Digit6');
    expect(await screen.findByTestId('seat-vote-target-6')).toBeTruthy();
    expect(screen.queryByTestId('live-hotkey-menu')).toBeNull();
    press('Digit8', { shiftKey: true });
    expect(await screen.findByTestId('live-hotkey-menu')).toBeTruthy();
    expect(screen.queryByTestId('seat-vote-target-8')).toBeNull();
  });

  it('Backspace in a voting takes back the last vote', async () => {
    await restore(votingSnapshot());
    press('Digit6');
    await screen.findByTestId('seat-vote-target-6');
    press('Backspace');
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="seat-vote-target-"]').length).toBe(0));
  });

  it('Space casts the vote for the highlighted seat in a voting', async () => {
    await restore(votingSnapshot());
    press('Digit9', { shiftKey: true });
    press('Escape');
    press('ArrowRight');
    press('Space');
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="seat-vote-target-"]').length).toBe(1));
  });

  it('Space starts the speech timer and Enter presses the main step button', async () => {
    await restore(baseSnapshot());
    press('Space');
    await waitFor(() => expect(screen.getByRole('button', { name: /Пауза/ })).toBeTruthy());
    press('Enter');
    await waitFor(() => expect(screen.getByTestId('live-judge-hud').textContent).toMatch(/Речь #2/));
  });

  it('Enter on a highlighted player opens that player\'s action panel instead of the main step', async () => {
    await restore(baseSnapshot());
    press('Digit3');
    expect(await screen.findByTestId('live-hotkey-menu')).toBeTruthy();
    press('Enter');
    await waitFor(() => expect(screen.queryByTestId('live-hotkey-menu')).toBeNull());
    expect(await screen.findByTestId('live-player-add-regular-foul')).toBeTruthy();
    expect(screen.getByTestId('live-judge-hud').textContent).toMatch(/Речь #1/);
  });

  it('Ctrl+Z undoes the last action', async () => {
    await restore(baseSnapshot());
    press('Digit3');
    press('KeyJ');
    await waitFor(() => expect(fouls(3)).not.toBeNull());
    press('KeyZ', { ctrlKey: true });
    await waitFor(() => expect(fouls(3)).toBeNull());
  });

  it('does nothing while typing into a field, and `?` opens the cheat sheet', async () => {
    await restore(baseSnapshot());
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { code: 'Digit3' });
    expect(screen.queryByTestId('live-hotkey-menu')).toBeNull();
    input.remove();
    press('Slash', { shiftKey: true });
    expect(await screen.findByTestId('live-hotkey-help')).toBeTruthy();
    press('Escape');
    expect(screen.queryByTestId('live-hotkey-help')).toBeNull();
  });

  it('«Вскрытие»: V opens the panel, and 6 after a seat marks that player as revealed and opens the sheet', async () => {
    await restore(baseSnapshot());
    press('KeyV');
    expect(await screen.findByTestId('live-reveal-panel')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByTestId('live-reveal-panel')).toBeNull());
    press('Digit9'); // a black player may reveal as the Sheriff too
    press('Digit6');
    expect(await screen.findByTestId('live-player-reveal-remove')).toBeTruthy();
  });

  it('an open player sheet owns the keyboard', async () => {
    await restore(baseSnapshot());
    press('Digit3');
    press('Digit0'); // the panel
    expect(await screen.findByTestId('live-player-add-regular-foul')).toBeTruthy();
    press('Digit4');
    expect(screen.queryByTestId('live-hotkey-menu')).toBeNull();
  });

  it('is off in the guided training', async () => {
    localStorage.setItem('mafia_live_session', JSON.stringify(baseSnapshot()));
    render(
      <LiveGameEngine players={[]} initialJudgeId={777} onGameFinished={vi.fn()} onCancel={vi.fn()} onPhaseChange={vi.fn()} trainingRoles={{}} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    await screen.findByTestId('live-judge-hud');
    press('Digit3');
    expect(screen.queryByTestId('live-hotkey-menu')).toBeNull();
  });
});
