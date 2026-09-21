/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtocolFirstKilledConfirmDialog } from '../components/crm/tournaments/protocol/ProtocolFirstKilledConfirmDialog';

afterEach(() => cleanup());

describe('ProtocolFirstKilledConfirmDialog', () => {
  it('preserves warning copy and delegates cancel/confirm actions', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(<ProtocolFirstKilledConfirmDialog isOpen onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByText('Подтверждение смены первоубиенного')).toBeTruthy();
    expect(screen.getByText('Выбранный ЛХ и ручной Ci прежнего первоубиенного будут очищены.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сменить и обнулить' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ProtocolFirstKilledConfirmDialog isOpen={false} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
