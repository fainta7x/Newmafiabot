// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SplitVoteTraining } from '../components/public/SplitVoteTraining.tsx';
import { correctSplitVote, generateSplitVoteScenario, splitVoteGroups } from '../lib/splitVoteTraining.ts';

afterEach(cleanup);

describe('zero-round split-vote training', () => {
  it('uses the four club examples and has exactly five voters on each side', () => {
    const cases: Array<{ pair: [number, number]; first: number[]; seat: number; vote: number }> = [
      { pair: [1, 4], first: [2, 3, 4, 5, 6], seat: 6, vote: 1 },
      { pair: [1, 8], first: [6, 7, 8, 9, 10], seat: 4, vote: 8 },
      { pair: [3, 8], first: [6, 7, 8, 9, 10], seat: 9, vote: 3 },
      { pair: [3, 5], first: [5, 6, 7, 8, 9], seat: 6, vote: 3 },
      { pair: [7, 9], first: [1, 2, 3, 9, 10], seat: 10, vote: 7 },
    ];
    for (const { pair, first, seat, vote } of cases) {
      const groups = splitVoteGroups(pair);
      expect(groups.first).toEqual(first);
      expect(groups.second).toHaveLength(5);
      expect(correctSplitVote({ pair, seat, candidates: [1, 2, 3, 5, 8] })).toBe(vote);
    }
  });

  it('covers every pair and varies consecutive tasks', () => {
    let previous = generateSplitVoteScenario(undefined, () => 0);
    for (let index = 0; index < 40; index += 1) {
      const next = generateSplitVoteScenario(previous, () => (index % 3) / 3);
      expect(next.pair).not.toEqual(previous.pair);
      expect(next.candidates.length).not.toBe(previous.candidates.length);
      expect(next.seat).not.toBe(previous.seat);
      expect(next.pair.every((candidate) => next.candidates.includes(candidate))).toBe(true);
      expect(new Set(next.candidates).size).toBe(next.candidates.length);
      expect(splitVoteGroups(next.pair).first).toHaveLength(5);
      previous = next;
    }
    for (let first = 1; first <= 10; first += 1) {
      for (let second = first + 1; second <= 10; second += 1) {
        expect(splitVoteGroups([first, second]).first).toHaveLength(5);
      }
    }
  });

  it('offers every nominated candidate and explains the result after a vote', () => {
    render(<SplitVoteTraining />);
    const initial = screen.getByTestId('split-vote-training');
    expect(initial.textContent).toContain('Ты сидишь на месте');
    const choices = screen.getAllByRole('button', { name: /^За №/ });
    expect(choices.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(choices[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить голос' }));
    expect(screen.getByRole('status').textContent).toContain('5:5');
    fireEvent.click(screen.getByRole('button', { name: 'Следующая задача' }));
    expect(screen.getByRole('button', { name: 'Проверить голос' })).toHaveProperty('disabled', true);
  });
});
