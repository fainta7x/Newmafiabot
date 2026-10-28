// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import VirtualRoleDeal from '../components/game/VirtualRoleDeal.tsx';
import { tableRoleCounts } from '../lib/tableComposition.ts';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ seat_number: i + 1, nickname: 'Player ' + (i + 1) }));
const choose = (position: number) => {
  fireEvent.click(screen.getByRole('button', { name: `Карта №${position}` }));
  fireEvent.click(screen.getByRole('button', { name: `Открыть карту №${position}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить роль и продолжить' }));
};
beforeEach(() => {
  vi.stubGlobal('crypto', { getRandomValues: (a: Uint32Array) => { a[0] = 0; return a; } });
});
describe('VirtualRoleDeal', () => {
  it.each([8, 9, 10])('deals correct %i-player composition, any card index and two-row layout', (n) => {
    const complete = vi.fn();
    render(<VirtualRoleDeal seats={seats(n)} onCancel={vi.fn()} onComplete={complete} />);
    const grid = screen.getByTestId('virtual-card-grid');
    expect(grid.className).toContain('grid-cols-5');
    for (let remaining = n; remaining > 0; remaining--) {
      const position = remaining === 4 ? 4 : remaining;
      expect(within(grid).getAllByRole('button')).toHaveLength(remaining);
      choose(position);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Все роли выданы — начать игру' }));
    const assignments = complete.mock.calls[0][0];
    const counts = tableRoleCounts(n);
    for (const role of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(Object.values(assignments).filter((value) => value === role)).toHaveLength(counts[role]);
    }
  });
  it('undo restores the exact previous layout and allows a different choice', () => {
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={vi.fn()} />);
    choose(7);
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Отменить последнюю карту' }));
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(10);
    expect(screen.getByText('Выбирает: №1 Player 1')).toBeTruthy();
    choose(3);
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(9);
  });
  it('asks for confirmation before discarding the deal', () => {
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={vi.fn()} />);
    choose(2);
    fireEvent.click(screen.getByRole('button', { name: 'Перераздать всё' }));
    fireEvent.click(screen.getByRole('button', { name: 'Нет' }));
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Перераздать всё' }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, перераздать' }));
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(10);
  });
});
