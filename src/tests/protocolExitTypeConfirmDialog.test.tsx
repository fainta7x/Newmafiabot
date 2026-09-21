/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProtocolExitTypeConfirmDialog,
  type PendingProtocolExitTypeChange,
} from '../components/crm/tournaments/protocol/ProtocolExitTypeConfirmDialog';

afterEach(() => cleanup());

const pending: PendingProtocolExitTypeChange = {
  participantId: 'p-4',
  newExitType: 'alive',
  playerName: 'Игрок 4',
  seatNum: 4,
};

describe('ProtocolExitTypeConfirmDialog', () => {
  it('preserves warning copy and delegates cancel/confirm actions', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ProtocolExitTypeConfirmDialog
        pending={pending}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Очистить оставленный протокол?')).toBeTruthy();
    expect(screen.getByText(/У игрока #4 \(Игрок 4\).*цветовой протокол/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить и изменить статус' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders nothing without a pending change', () => {
    const { container } = render(
      <ProtocolExitTypeConfirmDialog
        pending={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
