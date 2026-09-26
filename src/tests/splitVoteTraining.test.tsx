// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SplitVoteTraining } from '../components/public/SplitVoteTraining.tsx';
import { correctSplitVote, generateSplitVoteScenario, isCorrectSplitVoteAssignment, splitVoteAssignments, splitVoteGroups } from '../lib/splitVoteTraining.ts';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve({ passed: options?.method === 'POST' ? ['basic', 'advanced', 'interactive'] : ['basic', 'advanced'] }),
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('zero-round split-vote training', () => {
  const examButton = (level: 'basic' | 'advanced' | 'interactive') => screen.getByTestId(`split-vote-level-${level}`).querySelectorAll('button')[1];
  it('checks each nominated player, including nominees who receive no votes', () => {
    const scenario = { candidates: [3, 4, 1], pair: [1, 3] as [number, number], seat: 6 };
    const expected = splitVoteAssignments(scenario);
    expect(expected[4]).toEqual([]);
    expect(expected[1]).toEqual([2, 3, 4, 5, 6]);
    expect(expected[3]).toEqual([1, 7, 8, 9, 10]);
    expect(isCorrectSplitVoteAssignment(scenario, expected)).toBe(true);
    expect(isCorrectSplitVoteAssignment(scenario, { ...expected, 4: [7], 3: [1, 8, 9, 10] })).toBe(false);
  });

  it('keeps cards unavailable after assignment, allows backtracking and fails an exam at the final check', async () => {
    render(<SplitVoteTraining />);
    await waitFor(() => expect(examButton('interactive')).toHaveProperty('disabled', false));
    fireEvent.click(examButton('interactive'));
    const first = screen.getByRole('button', { name: '1' });
    fireEvent.click(first);
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(screen.queryByRole('button', { name: '1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к предыдущему' }));
    expect(screen.getByRole('button', { name: '1' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    const nominees = screen.getByTestId('split-vote-nominees').textContent!.split(':')[1].match(/\d+/g)!;
    for (let index = 0; index < nominees.length; index += 1) {
      // The last nominee takes everyone left automatically, so its button reads «Продолжить».
      fireEvent.click(screen.getByRole('button', { name: /^(Пропустить|Продолжить)$/ }));
    }
    expect(screen.queryByTestId('split-vote-result')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить голосование' }));
    expect(screen.getByTestId('split-vote-result').textContent).toContain('Экзамен не сдан: ошибка в вопросе 1');
  });
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
      expect(next.pair).not.toContain(next.seat);
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
    for (const difficulty of ['basic', 'advanced', 'interactive'] as const) {
      let previous = generateSplitVoteScenario(undefined, () => 0, difficulty);
      for (let index = 0; index < 30; index += 1) {
        const next = generateSplitVoteScenario(previous, () => (index % 4) / 4, difficulty);
        if (difficulty !== 'interactive') expect(next.pair[0] === 1).toBe(difficulty === 'basic');
        if (difficulty === 'basic') expect(next.candidates.length).toBeGreaterThanOrEqual(2);
        if (difficulty === 'basic') expect(next.candidates.length).toBeLessThanOrEqual(4);
        if (difficulty === 'interactive') expect(next.candidates.length).toBeGreaterThanOrEqual(3);
        if (difficulty === 'interactive') expect(next.candidates.length).toBeLessThanOrEqual(5);
        expect(next.pair).not.toContain(next.seat);
        expect(next.candidates.length).not.toBe(previous.candidates.length);
        expect(next.pair).not.toEqual(previous.pair);
        previous = next;
      }
    }
    for (let index = 0; index < 3; index += 1) {
      expect(generateSplitVoteScenario(undefined, () => (index + 0.1) / 3, 'basic').candidates).toHaveLength(index + 2);
      expect(generateSplitVoteScenario(undefined, () => (index + 0.1) / 3, 'interactive').candidates).toHaveLength(index + 3);
    }
  });

  it('randomizes the advanced nomination order without changing the vote', () => {
    const ascending = generateSplitVoteScenario(undefined, () => 0.999, 'advanced');
    const shuffled = generateSplitVoteScenario(undefined, () => 0, 'advanced');
    expect(ascending.candidates).toEqual([...ascending.candidates].sort((a, b) => a - b));
    expect(shuffled.candidates).not.toEqual([...shuffled.candidates].sort((a, b) => a - b));
    expect(shuffled.pair.every((candidate) => shuffled.candidates.includes(candidate))).toBe(true);
    expect(new Set(shuffled.candidates).size).toBe(shuffled.candidates.length);
    for (let seat = 1; seat <= 10; seat += 1) {
      expect(correctSplitVote({ ...shuffled, seat })).toBe(correctSplitVote({ ...shuffled, seat, candidates: [...shuffled.candidates].sort((a, b) => a - b) }));
    }
  });

  it('offers every nominated candidate and keeps the endless mode running', async () => {
    render(<SplitVoteTraining />);
    expect(screen.getByTestId('split-vote-modes')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Начать тренировку' })).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('button', { name: 'Начать тренировку' }));
    const choices = screen.getAllByRole('button', { name: /^В \d+$/ });
    const nominees = screen.getByTestId('split-vote-nominees').textContent?.split(':')[1].match(/\d+/g);
    expect(choices.map((choice) => choice.textContent?.replace('В ', ''))).toEqual(nominees);
    const previousSeat = screen.getByTestId('split-vote-seat').textContent;
    fireEvent.click(choices[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }));
    expect(screen.getByRole('status').textContent).toContain('по 5 голосов');
    fireEvent.click(screen.getByRole('button', { name: 'Следующая задача' }));
    expect(screen.getByRole('button', { name: 'Проверить ответ' })).toHaveProperty('disabled', true);
    expect(screen.getByTestId('split-vote-seat').textContent).not.toBe(previousSeat);
    expect(screen.getAllByRole('button', { name: /^В \d+$/ })).not.toHaveLength(choices.length);
    expect(screen.queryByTestId('split-vote-result')).toBeNull();
  });

  const answerQuestion = (right: boolean) => {
    const pair = screen.getByText(/^Попил между/).textContent!.match(/(\d+) и (\d+)/)!;
    const seat = Number(screen.getByTestId('split-vote-seat').textContent!.match(/(\d+)/)![1]);
    const answer = correctSplitVote({ pair: [Number(pair[1]), Number(pair[2])], seat, candidates: [] });
    const options = screen.getAllByRole('button', { name: /^В \d+$/ });
    const selected = options.find((button) => (button.textContent === `В ${answer}`) === right)!;
    fireEvent.click(selected);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }));
  };

  it('finishes basic practice after five answers, even if they include mistakes', async () => {
    render(<SplitVoteTraining />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Практика · 5 вопросов' })[0]);
    for (let index = 0; index < 5; index += 1) {
      expect(screen.getByTestId('split-vote-question').textContent).toContain(`Вопрос ${index + 1} из 5`);
      expect(screen.getByText(/^Попил между/).textContent).toMatch(/между 1 и \d+/);
      answerQuestion(false);
      if (index < 4) fireEvent.click(screen.getByRole('button', { name: 'Следующая задача' }));
    }
    expect(screen.getByTestId('split-vote-result').textContent).toContain('Практика завершена: 0 из 5');
  });

  it('fails an advanced exam immediately after its first mistake and allows a retry', async () => {
    render(<SplitVoteTraining />);
    await waitFor(() => expect(examButton('advanced')).toHaveProperty('disabled', false));
    fireEvent.click(examButton('advanced'));
    expect(screen.getByText(/^Попил между/).textContent).not.toMatch(/между 1 и/);
    answerQuestion(false);
    expect(screen.getByTestId('split-vote-result').textContent).toContain('Экзамен не сдан: ошибка в вопросе 1');
    expect(screen.queryByRole('button', { name: 'Следующая задача' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
    expect(screen.queryByTestId('split-vote-result')).toBeNull();
  });

  it('passes an exam only after five correct answers', async () => {
    render(<SplitVoteTraining />);
    await waitFor(() => expect(examButton('basic')).toHaveProperty('disabled', false));
    fireEvent.click(examButton('basic'));
    for (let index = 0; index < 5; index += 1) {
      answerQuestion(true);
      if (index < 4) {
        expect(screen.queryByTestId('split-vote-result')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Следующая задача' }));
      }
    }
    await waitFor(() => expect(screen.getByTestId('split-vote-result').textContent).toContain('Экзамен сдан: 5 из 5'));
    expect(screen.getByTestId('split-vote-result').className).toContain('border-emerald');
    expect(screen.getByRole('button', { name: 'Пройти ещё раз' })).toBeTruthy();
  });

  it('opens levels only after saving the prerequisite exam to the player account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options) => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ passed: options?.method === 'POST' ? ['basic'] : [] }),
    })));
    render(<SplitVoteTraining />);
    await waitFor(() => expect(examButton('basic')).toHaveProperty('disabled', false));
    expect(screen.getByTestId('split-vote-level-advanced').querySelectorAll('button')[0]).toHaveProperty('disabled', true);
    for (let index = 0; index < 5; index += 1) {
      if (index === 0) fireEvent.click(examButton('basic'));
      answerQuestion(true);
      if (index < 4) fireEvent.click(screen.getByRole('button', { name: 'Следующая задача' }));
    }
    await waitFor(() => expect(screen.getByTestId('split-vote-result').textContent).toContain('Экзамен сдан'));
    fireEvent.click(screen.getByRole('button', { name: 'К выбору режима' }));
    expect(screen.getByTestId('split-vote-passed-basic').textContent).toContain('Экзамен сдан');
    expect(examButton('basic').textContent).toBe('Пройти ещё раз');
    expect(screen.getByTestId('split-vote-level-advanced').querySelectorAll('button')[0]).toHaveProperty('disabled', false);
    expect(screen.getByTestId('split-vote-level-interactive').querySelectorAll('button')[0]).toHaveProperty('disabled', true);
    expect(fetch).toHaveBeenCalledWith('/api/player/split-vote-progress', expect.objectContaining({ method: 'POST' }));
  });

  it('keeps advanced levels and exams locked for an anonymous visitor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }));
    render(<SplitVoteTraining />);
    await waitFor(() => expect(screen.getAllByText(/войди в кабинет игрока/).length).toBeGreaterThan(0));
    expect(screen.getByTestId('split-vote-level-basic').querySelectorAll('button')[0]).toHaveProperty('disabled', false);
    expect(screen.getByTestId('split-vote-level-basic').querySelectorAll('button')[1]).toHaveProperty('disabled', true);
    expect(screen.getByTestId('split-vote-level-advanced').querySelectorAll('button')[0]).toHaveProperty('disabled', true);
  });
});
