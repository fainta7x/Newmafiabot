// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JudgeConductTraining from '../components/public/JudgeConductTraining.tsx';
import JudgeGameLauncher from '../components/player/JudgeGameLauncher.tsx';

const modal = vi.fn();
vi.mock('../components/player/JudgeTestGameModal.tsx', () => ({
  default: (props: { training?: boolean; onClose: (completed?: boolean) => void }) => {
    modal(props);
    return <button type="button" data-testid="fake-modal" onClick={() => props.onClose(true)}>{props.training ? 'учебная' : 'тестовая'}</button>;
  },
}));

afterEach(() => { cleanup(); modal.mockClear(); });

describe('judge practice lives in «Обучение», real conducting in the cabinet', () => {
  it('offers the guided training game and the free test game from one page', () => {
    render(<JudgeConductTraining />);
    fireEvent.click(screen.getByTestId('judge-free-test-game'));
    expect(screen.getByTestId('fake-modal').textContent).toBe('тестовая');
    expect(modal).toHaveBeenLastCalledWith(expect.objectContaining({ training: false }));
    fireEvent.click(screen.getByTestId('fake-modal'));
    fireEvent.click(screen.getByRole('button', { name: /Начать учебную партию/ }));
    expect(screen.getByTestId('fake-modal').textContent).toBe('учебная');
    expect(modal).toHaveBeenLastCalledWith(expect.objectContaining({ training: true }));
  });

  it('keeps the cabinet launcher for the real club game only and points to «Обучение» for practice', () => {
    render(<JudgeGameLauncher judge={{ id: 'j1', nickname: 'Судья' }} evenings={[]} onCreated={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Тестовая игра' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Посмотреть вечера' })).toBeDisabled();
    expect(screen.getByTestId('conduct-training-link').getAttribute('href')).toBe('/guide?from=conduct&tab=judge-conduct');
  });
});
