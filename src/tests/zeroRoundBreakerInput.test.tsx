/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtocolVotingTab } from '../components/crm/tournaments/protocol/ProtocolVotingTab.tsx';
import type { TournamentGameProtocolData, PlayerResultData } from '../lib/api.ts';

afterEach(cleanup);

describe('zero-round breaker in judge voting protocol', () => {
  it('explicitly records a seat and can clear the mark', () => {
    const onSetZeroBreakSeat = vi.fn();
    render(<ProtocolVotingTab
      protocol={{ status: 'draft', votes: [], events: [] } as unknown as TournamentGameProtocolData}
      playerResults={[{ participant_id: 'p8', seat_number: 8, display_name: 'Гриня' }] as PlayerResultData[]}
      voteDrafts={{}} setVoteDrafts={vi.fn()} highlightedRoundIdx={null}
      onAddVoting={vi.fn()} onDeleteVoting={vi.fn()} onRoundChange={vi.fn()}
      onConfirmOutcome={vi.fn()} onResetOutcome={vi.fn()}
      onSetZeroBreakSeat={onSetZeroBreakSeat}
    />);
    const select = screen.getByLabelText('Сломал в нуле');
    fireEvent.change(select, { target: { value: '8' } });
    expect(onSetZeroBreakSeat).toHaveBeenCalledWith(8);
    fireEvent.change(select, { target: { value: '' } });
    expect(onSetZeroBreakSeat).toHaveBeenCalledWith(null);
  });
});
