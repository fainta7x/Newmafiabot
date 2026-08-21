// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CenterPanel from '../components/LiveGameEngine/CenterPanel';
import type { VotingRound } from '../shared/tournamentVoting';
import { deactivateTableDecisionSelection } from '../components/LiveGameEngine/tableDecisionSelectionStore';

const players = Array.from({ length: 10 }, (_, index) => ({
  slot_num: index + 1,
  nickname: `Игрок ${index + 1}`,
  alive: true,
  role: index === 9 ? 'Дон' : index >= 7 ? 'Мафия' : index === 6 ? 'Шериф' : 'Мирный',
  team: index >= 7 ? 'Чёрные' : 'Красные',
})) as any;

const baseProps = () => ({
  activePlayers: players,
  activeSpeakerSlot: null,
  setActiveSpeakerSlot: vi.fn(),
  phase: 'day_speeches' as const,
  roundNumber: 1,
  timeLeft: 60,
  setTimeLeft: vi.fn(),
  zeroNightSubPhase: null,
  customTimerLabel: null,
  isTimerRunning: false,
  setIsTimerRunning: vi.fn(),
  timerMax: 60,
  handleAdjustTime: vi.fn(),
  handleStartZeroNightTimer: vi.fn(),
  donCheckSlot: null,
  donCheckResult: null,
  sheriffCheckSlot: null,
  sheriffCheckResult: null,
  nextSpeaker: players[0],
  handleStartNextSpeaker: vi.fn(),
  nominations: [],
  currentVotingNomineeIndex: 0,
  selectVotingNomineeIndex: vi.fn(),
  votes: {},
  votesByPlayer: {},
  handleInteractiveAutoRemainder: vi.fn(),
  handleAllocateVotes: vi.fn(),
  handleResolveVoting: vi.fn(),
  nightSubPhase: 'intro' as const,
  shotPlayerSlot: null,
  getPrevStepAction: () => null,
  getNextStepInfo: () => null,
});

afterEach(() => {
  cleanup();
  deactivateTableDecisionSelection();
  sessionStorage.clear();
});

describe('CenterPanel live flow guardrails', () => {
  it('keeps zero-night music and progression on the single canonical next-step control', () => {
    const agreement = vi.fn();
    const openZeroRound = vi.fn();
    const initialProps = baseProps();
    const { rerender } = render(<CenterPanel
      {...initialProps}
      phase="zero_night"
      nextSpeaker={null}
      getNextStepInfo={() => ({ label: 'Договорка · 75с', onClick: agreement })}
    />);

    const musicStart = screen.getByRole('button', { name: /Включить музыку ночи/i });
    expect(musicStart).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Договорка · 75с/i })).toBeNull();
    expect(screen.getByText('Договорка', { exact: true })).toBeTruthy();

    fireEvent.click(musicStart);
    expect(screen.getAllByRole('button', { name: /Договорка · 75с/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Вызов шерифа · 10с/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Свободная посадка · 40с/i })).toBeNull();

    rerender(<CenterPanel
      {...initialProps}
      phase="zero_night"
      zeroNightSubPhase="seating"
      nextSpeaker={null}
      getNextStepInfo={() => ({ label: 'Открыть нулевой круг', onClick: openZeroRound })}
    />);

    const musicStop = screen.getByRole('button', { name: /Выключить музыку/i });
    expect(musicStop).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Открыть нулевой круг/i })).toBeNull();

    fireEvent.click(musicStop);
    expect(screen.getAllByRole('button', { name: /Открыть нулевой круг/i })).toHaveLength(1);
  });

  it('keeps voting on player cards and never exposes synthetic plus/minus voters', () => {
    const currentRound: VotingRound = {
      round_number: 1,
      is_revote: false,
      nominated_seats: [2, 5],
      vote_counts: { 2: 6, 5: 4 },
      eligible_voters: 10,
      day_number: 0,
      outcome: 'pending',
      eliminated_seats: [],
      table_leave_votes: null,
    };
    const votesByPlayer = { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 };

    render(<CenterPanel
      {...baseProps()}
      phase="day_voting"
      nextSpeaker={null}
      nominations={[2, 5]}
      votes={{ 2: 6, 5: 4 }}
      votesByPlayer={votesByPlayer}
      votingRounds={[currentRound]}
      activeVotingRoundIndex={0}
      votingStage="collecting"
    />);

    expect(screen.queryByText(/голосование математически решено/i)).toBeNull();
    expect(screen.queryByRole('button', { name: '+1' })).toBeNull();
    expect(screen.queryByRole('button', { name: '−1' })).toBeNull();
    expect(screen.getByText(/Нажимайте карточки игроков/)).toBeTruthy();
    expect(screen.getByText('6', { exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Следующий/i })).toBeTruthy();
  });

  it('shows the explicit voter count rather than the aggregate remainder preview', () => {
    const currentRound: VotingRound = {
      round_number: 1,
      is_revote: false,
      nominated_seats: [2, 5],
      vote_counts: { 2: 8, 5: 2 },
      eligible_voters: 10,
      day_number: 0,
      outcome: 'pending',
      eliminated_seats: [],
      table_leave_votes: null,
    };

    render(<CenterPanel
      {...baseProps()}
      phase="day_voting"
      nextSpeaker={null}
      nominations={[2, 5]}
      votes={{ 2: 8, 5: 2 }}
      votesByPlayer={{ 1: 2, 2: 2 }}
      votingRounds={[currentRound]}
      activeVotingRoundIndex={0}
      votingStage="collecting"
    />);

    const stats = document.querySelectorAll('.live-judge-stat__value');
    expect(stats[0]?.textContent).toBe('2');
    expect(stats[1]?.textContent).toBe('8/10');
  });

  it('keeps the last candidate explicit until the judge actually finalizes', () => {
    const currentRound: VotingRound = {
      round_number: 1,
      is_revote: false,
      nominated_seats: [2, 5],
      vote_counts: { 2: 4, 5: 6 },
      eligible_voters: 10,
      day_number: 0,
      outcome: 'pending',
      eliminated_seats: [],
      table_leave_votes: null,
    };

    render(<CenterPanel
      {...baseProps()}
      phase="day_voting"
      nextSpeaker={null}
      nominations={[2, 5]}
      currentVotingNomineeIndex={1}
      votes={{ 2: 4, 5: 6 }}
      votesByPlayer={{ 1: 2, 2: 2, 3: 2, 4: 2 }}
      votingRounds={[currentRound]}
      activeVotingRoundIndex={0}
      votingStage="collecting"
    />);

    expect(screen.getByText(/Неотмеченные голоса уйдут сюда только при подведении итога/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+1' })).toBeNull();
    expect(screen.queryByRole('button', { name: '−1' })).toBeNull();
    expect(screen.getByRole('button', { name: /Подвести итог/i })).toBeTruthy();
  });
});
