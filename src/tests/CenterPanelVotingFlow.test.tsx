// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CenterPanel from '../components/LiveGameEngine/CenterPanel';
import type { VotingRound } from '../shared/tournamentVoting';

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

afterEach(cleanup);

describe('CenterPanel live flow guardrails', () => {
  it('keeps zero-night progression on the single canonical next-step control', () => {
    const next = vi.fn();
    render(<CenterPanel
      {...baseProps()}
      phase="zero_night"
      nextSpeaker={null}
      getNextStepInfo={() => ({ label: 'Договорка · 75с', onClick: next })}
    />);

    expect(screen.getAllByRole('button', { name: /Договорка · 75с/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Вызов шерифа · 10с/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Посадка · 40с/i })).toBeNull();
    expect(screen.getByText(/этапы нельзя перескочить/i)).toBeTruthy();
  });

  it('continues the full voting order even when one candidate already has an unbeatable lead', () => {
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
    expect(screen.queryByRole('button', { name: /Зафиксировать итог/i })).toBeNull();
    expect(screen.getByRole('button', { name: '+1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '−1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Следующий/i })).toBeTruthy();
  });

  it('does not expose manual plus/minus controls for the automatic last candidate', () => {
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

    expect(screen.getByText(/последнему кандидату автоматически/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+1' })).toBeNull();
    expect(screen.queryByRole('button', { name: '−1' })).toBeNull();
    expect(screen.getByRole('button', { name: /Подвести итог/i })).toBeTruthy();
  });
});
