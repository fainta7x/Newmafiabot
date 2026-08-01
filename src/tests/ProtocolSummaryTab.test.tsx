// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ProtocolSummaryTab } from '../components/crm/tournaments/protocol/ProtocolSummaryTab';
import * as gameDiscipline from '../lib/gameDiscipline';

vi.mock('../lib/gameDiscipline', () => ({
  calculateDisciplinaryPenalty: vi.fn(() => 0.3),
}));

test('ProtocolSummaryTab uses canonical calculateDisciplinaryPenalty and displays correct columns and formatting', () => {
  const protocol = {
    id: 'p1',
    game_id: 'g1',
    status: 'draft',
    winner_team: null,
  } as any;

  const playerResults = [
    {
      participant_id: 'p1',
      seat_number: 1,
      display_name: 'Player 1',
      role: 'citizen',
      exit_type: 'alive',
      minor_technical_fouls: 1,
      major_technical_fouls: 0,
      penalty_points: 0.5, // Legacy penalty_points value that MUST NOT be displayed in table
      judge_bonus: -0.6,
      protocol_bonus: 0.4,
    }
  ] as any;

  render(
    <ProtocolSummaryTab
      protocol={protocol}
      playerResults={playerResults}
      onWinnerTeamChange={() => {}}
      onReplacementChange={() => {}}
      onJudgeNotesChange={() => {}}
    />
  );

  // Check if the mock was called
  expect(gameDiscipline.calculateDisciplinaryPenalty).toHaveBeenCalledWith(1, 0, false, false);

  // Headers check
  expect(screen.getByText('Дисц. минус')).toBeDefined();
  expect(screen.getByText('Балл судьи')).toBeDefined();
  expect(screen.getByText('Протокол')).toBeDefined();
  expect(screen.queryByText('Игр. м.')).toBeNull();

  // Negative judge bonus formatted as −0.6
  expect(screen.getByText('−0.6')).toBeDefined();
  // Protocol bonus formatted as +0.4
  expect(screen.getByText('+0.4')).toBeDefined();
  // Disciplinary minus formatted as −0.3
  expect(screen.getByText('−0.3')).toBeDefined();
});
