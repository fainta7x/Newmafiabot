// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog';
import MobileSheet from './MobileSheet';
import { SegmentedControl } from './SegmentedControl';

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  if (!globalThis.ResizeObserver) {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
  }

  if (!Element.prototype.getAnimations) {
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value: () => [],
    });
  }
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('shared Stage 4 interaction patterns', () => {
  it('renders ConfirmDialog through the canonical portaled dialog and confirms', async () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Удалить запись?"
        description="Действие нельзя отменить."
        confirmLabel="Удалить"
        tone="danger"
        onConfirm={confirm}
        onCancel={cancel}
      />,
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.closest('#root')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('keeps the legacy MobileSheet API on the canonical sheet behavior', async () => {
    const close = vi.fn();
    render(
      <MobileSheet
        open
        title="Фильтры"
        subtitle="Настройка списка"
        onClose={close}
        footer={<button type="button">Применить</button>}
      >
        <p>Параметры</p>
      </MobileSheet>,
    );

    expect(await screen.findByText('Параметры')).toBeTruthy();
    expect(screen.getByText('Применить')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it('switches the canonical SegmentedControl and marks only the active item', () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="Разделы"
        value="players"
        items={[
          { value: 'players', label: 'Игроки' },
          { value: 'activity', label: 'Активность' },
        ]}
        onValueChange={onValueChange}
      />,
    );

    const players = screen.getByRole('button', { name: 'Игроки' });
    const activity = screen.getByRole('button', { name: 'Активность' });
    expect(players.getAttribute('aria-current')).toBe('page');
    expect(activity.getAttribute('aria-current')).toBeNull();

    fireEvent.click(activity);
    expect(onValueChange).toHaveBeenCalledWith('activity');
  });
});
