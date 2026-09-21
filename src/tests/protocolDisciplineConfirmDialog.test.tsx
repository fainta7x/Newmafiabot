/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProtocolDisciplineConfirmDialog,
  type PendingProtocolDisciplineAction,
} from '../components/crm/tournaments/protocol/ProtocolDisciplineConfirmDialog';

afterEach(() => cleanup());

const pending = (
  type: PendingProtocolDisciplineAction['type'],
  extra: Partial<PendingProtocolDisciplineAction> = {},
): PendingProtocolDisciplineAction => ({
  participantId: 'p-1',
  type,
  playerName: 'Игрок 1',
  seatNum: 1,
  ...extra,
});

describe('ProtocolDisciplineConfirmDialog', () => {
  it('preserves fourth-foul confirmation text and delegates actions', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ProtocolDisciplineConfirmDialog
        pending={pending('foul_4')}
        winnerTeam={null}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Подтвердите 4-й фол')).toBeTruthy();
    expect(screen.getByText(/Будет автоматически удалён.*4-й фол/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows technical-foul type', () => {
    render(
      <ProtocolDisciplineConfirmDialog
        pending={pending('tech_2', { techType: 'major' })}
        winnerTeam={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Подтвердите 2-й техфол')).toBeTruthy();
    expect(screen.getByText('Большой')).toBeTruthy();
  });

  it('blocks PPK confirmation until an opposing winner can be derived', () => {
    const { rerender } = render(
      <ProtocolDisciplineConfirmDialog
        pending={pending('ppk')}
        winnerTeam={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Победитель: Не определён')).toBeTruthy();
    expect(screen.getByText('Сначала назначьте роль участнику в рассадке')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Подтвердить' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <ProtocolDisciplineConfirmDialog
        pending={pending('ppk')}
        winnerTeam="black"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Победитель: Чёрные')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Подтвердить' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders nothing without a pending action', () => {
    const { container } = render(
      <ProtocolDisciplineConfirmDialog
        pending={null}
        winnerTeam={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
