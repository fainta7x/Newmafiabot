/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EndGameRevealsOverlay } from '../components/LiveGameEngine/EndGameRevealsOverlay';

afterEach(cleanup);

// Owner, 2026-11-15: at the end of a game the judge is asked whether a black claimed to be the Sheriff and which checks he named.
describe('EndGameRevealsOverlay', () => {
  const base = {
    blacks: [2, 8], nicknameOf: (seat: number) => `Игрок ${seat}`, roleLabelOf: (seat: number) => (seat === 8 ? 'Дон' : 'Мафия'),
    seats: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], onRemoveReveal: vi.fn(), onRemoveCheck: vi.fn(),
  };

  it('asks about every black and closes the game with «Готово»', () => {
    const onDone = vi.fn(); const onReveal = vi.fn();
    render(<EndGameRevealsOverlay {...base} reveals={[]} onReveal={onReveal} onSetCheck={vi.fn()} onDone={onDone} />);
    expect(screen.getByTestId('live-end-reveal-2')).toBeTruthy();
    expect(screen.getByTestId('live-end-reveal-8').textContent).toContain('Дон');
    fireEvent.click(screen.getByTestId('live-end-reveal-toggle-8'));
    expect(onReveal).toHaveBeenCalledWith(8);
    fireEvent.click(screen.getByTestId('live-end-reveals-done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('lists the announced checks by circle and adds the next one', () => {
    const onSetCheck = vi.fn();
    render(<EndGameRevealsOverlay {...base} reveals={[{ seat: 8, checks: [{ target: 4, color: 'red' }] }]} onReveal={vi.fn()} onSetCheck={onSetCheck} onDone={vi.fn()} />);
    expect(screen.getByTestId('live-end-reveal-8').textContent).toContain('Круг 1');
    fireEvent.click(screen.getByTestId('live-end-reveal-add-black-8'));
    expect(screen.getByTestId('live-end-reveal-8').textContent).toContain('Круг 2');
    expect(screen.queryByTestId('live-end-reveal-target-8-4')).toBeNull();
    fireEvent.click(screen.getByTestId('live-end-reveal-target-8-6'));
    expect(onSetCheck).toHaveBeenCalledWith(8, 6, 'black');
  });
});
