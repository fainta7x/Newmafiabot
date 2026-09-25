// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SplitVoteTraining } from '../components/public/SplitVoteTraining.tsx';
import { correctSplitVote, generateSplitVoteScenario, splitVoteGroups } from '../lib/splitVoteTraining.ts';

afterEach(cleanup);

describe('zero-round split-vote training', () => {
  it('uses the club examples and has exactly five voters on each side', () => {
    const cases: Array<{ pair: [number, number]; first: number[]; seat: number; vote: number }> = [
      { pair: [1, 4], first: [2, 3, 4, 5, 6], seat: 6, vote: 1 },
      { pair: [1, 8], first: [6, 7, 8, 9, 10], seat: 4, vote: 8 },
      { pair: [3, 8], first: [6, 7, 8, 9, 10], seat: 9, vote: 3 },
      { pair: [3, 5], first: [4, 5, 6, 7, 8], seat: 6, vote: 3 },
      { pair: [7, 9], first: [1, 2, 8, 9, 10], seat: 10, vote: 7 },
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
        const expected = first === 1 && second <= 5 ? [2, 3, 4, 5, 6]
          : first <= 5 && second >= 6 ? [6, 7, 8, 9, 10]
            : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((seat) => [1, 2, 3, 4, 5].some((step) => (first + step - 1) % 10 + 1 === seat));
        const groups = splitVoteGroups([first, second]);
        expect(groups.first).toEqual(expected);
        expect(groups.second).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((seat) => !expected.includes(seat)));
        for (let seat = 1; seat <= 10; seat += 1) {
          expect(correctSplitVote({ pair: [first, second], candidates: [first, second], seat })).toBe(expected.includes(seat) ? first : second);
        }
      }
    }
    for (let index = 0; index < 9; index += 1) {
      expect(generateSplitVoteScenario(undefined, () => (index + 0.1) / 9).candidates).toHaveLength(index + 2);
    }
    for (const difficulty of ['basic', 'advanced'] as const) {
      let previous = generateSplitVoteScenario(undefined, () => 0, difficulty);
      for (let index = 0; index < 30; index += 1) {
        const next = generateSplitVoteScenario(previous, () => (index % 4) / 4, difficulty);
        expect(next.pair[0] === 1).toBe(difficulty === 'basic');
        expect(next.pair).not.toEqual(previous.pair);
        previous = next;
      }
    }
  });

  it('offers every nominated candidate and keeps the endless mode running', () => {
    render(<SplitVoteTraining />);
    expect(screen.getByTestId('split-vote-modes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Начать тренировку' }));
    const choices = screen.getAllByRole('button', { name: /^За №/ });
    const nominees = screen.getByTestId('split-vote-nominees').textContent?.match(/№\d+/g);
    expect(choices.map((choice) => choice.textContent?.replace('За ', ''))).toEqual(nominees);
    const previousSeat = screen.getByTestId('split-vote-seat').textContent;
    fireEvent.click(choices[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить голос' }));
    expect(screen.getByRole('status').textContent).toContain('5:5');
    fireEvent.click(screen.getByRole('button', { name: 'Следующая задача' }));
    expect(screen.getByRole('button', { name: 'Проверить голос' })).toHaveProperty('disabled', true);
    expect(screen.getByTestId('split-vote-seat').textContent).not.toBe(previousSeat);
    expect(screen.getAllByRole('button', { name: /^За №/ })).not.toHaveLength(choices.length);
    expect(screen.queryByTestId('split-vote-result')).toBeNull();
  });

  const answerQuestion = (right: boolean) => {
    const pair = screen.getByText(/Из них делим/).textContent!.match(/№(\d+) и №(\d+)/)!;
    const seat = Number(screen.getByTestId('split-vote-seat').textContent!.match(/№(\d+)/)![1]);
    const answer = correctSplitVote({ pair: [Number(pair[1]), Number(pair[2])], seat, candidates: [] });
    const options = screen.getAllByRole('button', { name: /^За №/ });
    const selected = options.find((button) => (button.textContent === `За №${answer}`) === right)!;
    fireEvent.click(selected);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить голос' }));
  };

  it('finishes basic practice after five answers, even if they include mistakes', () => {
    render(<SplitVoteTraining />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Практика · 5 вопросов' })[0]);
    for (let index = 0; index < 5; index += 1) {
      expect(screen.getByTestId('split-vote-question').textContent).toContain(`Вопрос ${index + 1} из 5`);
      expect(screen.getByText(/Из них делим/).textContent).toMatch(/№1 и №\d+/);
      answerQuestion(false);
      if (index < 4) fireEvent.click(screen.getByRole('button', { name: 'Следующая задача' }));
    }
    expect(screen.getByTestId('split-vote-result').textContent).toContain('Практика завершена: 0 из 5');
  });

  it('fails an advanced exam immediately after its first mistake and allows a retry', () => {
    render(<SplitVoteTraining />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Экзамен · 5 без ошибок' })[1]);
    expect(screen.getByText(/Из них делим/).textContent).not.toMatch(/№1 и/);
    answerQuestion(false);
    expect(screen.getByTestId('split-vote-result').textContent).toContain('Экзамен не сдан: ошибка в вопросе 1');
    expect(screen.queryByRole('button', { name: 'Следующая задача' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
    expect(screen.queryByTestId('split-vote-result')).toBeNull();
  });

  it('passes an exam only after five correct answers', () => {
    render(<SplitVoteTraining />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Экзамен · 5 без ошибок' })[0]);
    for (let index = 0; index < 5; index += 1) {
      answerQuestion(true);
      if (index < 4) {
        expect(screen.queryByTestId('split-vote-result')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Следующая задача' }));
      }
    }
    expect(screen.getByTestId('split-vote-result').textContent).toContain('Экзамен сдан: 5 из 5');
  });
});
