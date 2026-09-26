// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SplitVoteExpertSession } from '../components/public/SplitVoteExpert.tsx';
import type { ExpertScenario } from '../lib/splitVoteExpert.ts';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const stray: ExpertScenario = { candidates: [2, 1, 4, 3], pair: [1, 3], broken: { kind: 'stray', nominee: 2, voter: 4 } };
const pick = (...seats: number[]) => seats.forEach((seat) => fireEvent.click(screen.getByRole('button', { name: `№${seat}` })));

describe('expert split-vote screen', () => {
  it('starts after the break and accepts a rescue with one insurer', () => {
    render(<SplitVoteExpertSession mode="endless" scenarios={[stray, stray]} onExit={() => undefined} onPassed={async () => true} />);
    expect(screen.getByTestId('split-vote-break').textContent).toContain('За №2 случайно проголосовал №4');
    expect(screen.getByRole('heading', { name: 'Кто голосует за №1?' })).toBeTruthy();
    // №4 already voted and is not offered again.
    expect(screen.queryByRole('button', { name: '№4' })).toBeNull();
    pick(2, 3, 5, 6);
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    pick(7);
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    // Everyone else goes to the last nominee, №3, and the result is checked at once.
    expect(screen.getByRole('status').textContent).toContain('Попил спасён!');
  });

  it('fails the task when 15 seconds run out', () => {
    vi.useFakeTimers();
    render(<SplitVoteExpertSession mode="endless" scenarios={[stray]} onExit={() => undefined} onPassed={async () => true} />);
    act(() => { vi.advanceTimersByTime(16_000); });
    expect(screen.getByRole('status').textContent).toContain('Время вышло');
    // The explanation shows one correct rescue.
    expect(screen.getByRole('status').textContent).toContain('Например, так');
  });
});
