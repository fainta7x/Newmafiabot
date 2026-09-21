/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerResultData, TournamentGameProtocolData } from '../lib/api';
import { ProtocolCompletionDialogs } from '../components/crm/tournaments/protocol/ProtocolCompletionDialogs';

afterEach(() => cleanup());

const playerResults = [
  { participant_id: 'p-1', seat_number: 1, role: 'citizen' },
  { participant_id: 'p-2', seat_number: 2, role: 'mafia' },
  { participant_id: 'p-3', seat_number: 3, role: 'don' },
] as PlayerResultData[];

const protocol = {
  game_id: 'game-1',
  status: 'draft',
  winner_team: 'red',
  first_killed_participant_id: 'p-1',
  zero_round_voted_participant_id: null,
  best_move_participant_id: null,
  best_move_source: null,
  best_move_seats: [],
  best_moves: [{
    participant_id: 'p-1',
    source: 'first_killed',
    seat_numbers: [2, 3],
  }],
  votes: [],
  shots: [],
  replacement: null,
  judge_notes: null,
  best_move_score: 0,
} as TournamentGameProtocolData;

describe('ProtocolCompletionDialogs', () => {
  it('renders completion summary and delegates cancel/confirm actions', () => {
    const onCancelComplete = vi.fn();
    const onConfirmComplete = vi.fn();

    render(
      <ProtocolCompletionDialogs
        protocol={protocol}
        playerResults={playerResults}
        showCompleteConfirm
        showRevertConfirm={false}
        submitting={false}
        onCancelComplete={onCancelComplete}
        onConfirmComplete={onConfirmComplete}
        onCancelRevert={vi.fn()}
        onConfirmRevert={vi.fn()}
      />,
    );

    expect(screen.getByText('Завершить протокол игры?')).toBeTruthy();
    expect(screen.getByText('Красные')).toBeTruthy();
    expect(screen.getByText(/ЛХ Первого убитого: #2, #3/)).toBeTruthy();
    expect(screen.getByText(/\+0\.3 б\./)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить завершение' }));

    expect(onCancelComplete).toHaveBeenCalledTimes(1);
    expect(onConfirmComplete).toHaveBeenCalledTimes(1);
  });

  it('preserves submitting labels and disabled state', () => {
    render(
      <ProtocolCompletionDialogs
        protocol={{ ...protocol, best_moves: [] }}
        playerResults={playerResults}
        showCompleteConfirm
        showRevertConfirm
        submitting
        onCancelComplete={vi.fn()}
        onConfirmComplete={vi.fn()}
        onCancelRevert={vi.fn()}
        onConfirmRevert={vi.fn()}
      />,
    );

    expect(screen.getByText('Лучший ход: Не указан')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Завершаем...' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Возвращаем...' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('delegates revert cancellation and confirmation', () => {
    const onCancelRevert = vi.fn();
    const onConfirmRevert = vi.fn();

    render(
      <ProtocolCompletionDialogs
        protocol={protocol}
        playerResults={playerResults}
        showCompleteConfirm={false}
        showRevertConfirm
        submitting={false}
        onCancelComplete={vi.fn()}
        onConfirmComplete={vi.fn()}
        onCancelRevert={onCancelRevert}
        onConfirmRevert={onConfirmRevert}
      />,
    );

    expect(screen.getByText('Вернуть протокол в черновик?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, вернуть в черновик' }));

    expect(onCancelRevert).toHaveBeenCalledTimes(1);
    expect(onConfirmRevert).toHaveBeenCalledTimes(1);
  });
});
