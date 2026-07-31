// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ProtocolSummaryTab } from '../components/crm/tournaments/protocol/ProtocolSummaryTab';
import * as gameDiscipline from '../lib/gameDiscipline';

vi.mock('../lib/gameDiscipline', () => ({
  calculateDisciplinaryPenalty: vi.fn(() => -0.3),
}));

test('ProtocolSummaryTab uses canonical calculateDisciplinaryPenalty', () => {
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
});
