/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtocolZeroRoundConfirmDialog } from '../components/crm/tournaments/protocol/ProtocolZeroRoundConfirmDialog';

afterEach(() => cleanup());

describe('ProtocolZeroRoundConfirmDialog', () => {
  it('preserves warning copy and delegates cancel/confirm actions', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(<ProtocolZeroRoundConfirmDialog isOpen onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByText('Подтверждение смены игрока нулевого круга')).toBeTruthy();
    expect(screen.getByText('Выбранные номера ЛХ прежнего игрока будут очищены.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сменить и очистить' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ProtocolZeroRoundConfirmDialog isOpen={false} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
