/** @vitest-environment jsdom */
/** After a reload the resumed game window takes its saved game by itself (owner, 2026-10-18). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LiveGameEngine from '../components/LiveGameEngine';
import { markAutoRestore, resetLiveGameResumeClaim } from '../lib/liveGameResume';
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

describe('Live Game after a reload', () => {
  it('starts a fresh tournament with saved roles without erasing the initial roster', async () => {
    resetLiveGameResumeClaim();
    const roles = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1,
      i === 9 ? 'don' : i >= 7 ? 'mafia' : i === 6 ? 'sheriff' : 'citizen'])) as any;
    const players = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1, user_id: i + 1, nickname: `Игрок ${i + 1}`,
      notes: `__tournament_role__:${roles[i + 1]}`,
    }));
    players.push({ id: 10001, user_id: 10001, nickname: 'Судья', notes: '__tournament_engine_judge__' });
    render(<LiveGameEngine players={players as any} initialJudgeId={10001} roleAssignments={roles}
      onGameFinished={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Запустить Игру 🚀' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('mafia_live_session') || 'null')?.phase).toBe('zero_night'));
    const saved = JSON.parse(localStorage.getItem('mafia_live_session')!);
    expect(saved.activePlayers.map((p: any) => p.user_id)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(saved.activePlayers.map((p: any) => p.role)).toEqual(Object.values(roles));
  });

  it('applies observed CRM roles once, preserves legacy evidence and retains corrections through Undo/reload', async () => {
    resetLiveGameResumeClaim();
    const initial = baseSnapshot();
    const frame = baseSnapshot();
    initial.activePlayers[0].fouls = 1;
    localStorage.setItem('mafia_live_session', JSON.stringify({ ...initial, historyStack: [frame] }));
    const seed = { votes: [], shots: [], events: [{ seq: 1, at: '2026-10-23', round: 1, phase: 'zero_night', kind: 'game_start' }] };
    const props = { players: [], initialJudgeId: 777, onGameFinished: vi.fn(), onCancel: vi.fn(), readProtocolEvidence: () => seed };
    const view = render(<LiveGameEngine {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    const roles = Object.fromEntries(initial.activePlayers.map((p: any) => [p.slot_num,
      p.slot_num === 1 ? 'mafia' : p.slot_num === 8 ? 'citizen' : p.slot_num === 10 ? 'don' : p.slot_num === 7 ? 'sheriff' : p.slot_num >= 8 ? 'mafia' : 'citizen'])) as any;
    view.rerender(<LiveGameEngine {...props} roleAssignments={roles} />);
    const saved = () => JSON.parse(localStorage.getItem('mafia_live_session')!);
    await waitFor(() => expect(saved().activePlayers[0]).toMatchObject({ role: 'mafia', team: 'black', fouls: 1 }));
    expect(saved().protocolEvidence.events.filter((e: any) => e.kind === 'role_corrected')).toHaveLength(2);
    expect(saved().protocolEvidence.events[0]).toEqual(seed.events[0]);
    expect(saved().historyStack[0].activePlayers[0].role).toBe('mafia');
    view.rerender(<LiveGameEngine {...props} roleAssignments={null} />); // incomplete CRM edit retains the last complete deal
    fireEvent.click(screen.getByRole('button', { name: /Назад/ }));
    await waitFor(() => expect(saved().activePlayers[0]).toMatchObject({ role: 'mafia', team: 'black', fouls: 0 }));
    expect(saved().protocolEvidence.events.filter((e: any) => e.kind === 'role_corrected')).toHaveLength(2);
    view.unmount();
    render(<LiveGameEngine {...props} roleAssignments={roles} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    await waitFor(() => expect(saved().activePlayers[0].role).toBe('mafia'));
    expect(saved().protocolEvidence.events.filter((e: any) => e.kind === 'role_corrected')).toHaveLength(2);
  });

  it('restores the saved game without the «Восстановить» question when the window was resumed', async () => {
    resetLiveGameResumeClaim();
    markAutoRestore();
    renderRecovered(baseSnapshot());
    // the saved day is on the screen at once: the speaker's timer and the step button
    expect(await screen.findByTestId('live-judge-hud')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('live-judge-hud').textContent).toMatch(/Речь #1/));
    expect(screen.queryByRole('button', { name: 'Восстановить' })).toBeNull();
  });

  it('a window opened by hand still asks', async () => {
    resetLiveGameResumeClaim();
    renderRecovered(baseSnapshot());
    expect(await screen.findByRole('button', { name: 'Восстановить' })).toBeTruthy();
  });
});
