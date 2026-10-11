// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MafiaReasoningCourse from '../components/public/guide/MafiaReasoningCourse.tsx';
import { REASONING_LABS, VOTE_PLANS, calculateVoteResult, labCasesForAttempt } from '../lib/mafiaReasoningLabs.ts';

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe('Advanced reasoning labs: pure vote rules and playable learning flow', () => {
  it('calculates both legal outcomes of a 5-seat critical vote without inventing a free re-vote', () => {
    const plan = VOTE_PLANS[0];
    const first = calculateVoteResult(plan, 2);
    const last = calculateVoteResult(plan, 4);
    expect(first).toEqual({ counts: { 2: 3, 4: 2 }, votedOut: 2, status: 'continues_after_protocol' });
    expect(last).toEqual({ counts: { 2: 2, 4: 3 }, votedOut: 4, status: 'black_win_after_protocol' });
  });

  it('recognizes red victory when the last mafia is voted out', () => {
    const plan = { ...VOTE_PLANS[0], black: [2] };
    const result = calculateVoteResult(plan, 2);
    expect(result.status).toBe('red_win_after_protocol');
    expect(result.votedOut).toBe(2);
  });

  it('handles 7 alive, tie on 6 alive and another 5-player arrangement correctly', () => {
    const seven = VOTE_PLANS[1];
    expect(calculateVoteResult(seven, 4)).toEqual({
      counts: { 2: 3, 4: 4 }, votedOut: 4, status: 'black_win_after_protocol',
    });
    expect(calculateVoteResult(seven, 2).votedOut).toBe(2);
    const six = VOTE_PLANS[2];
    expect(calculateVoteResult(six, 4)).toEqual({
      counts: { 2: 3, 4: 3 }, votedOut: null, status: 'tie_needs_revote',
    });
    expect(calculateVoteResult(six, 2)).toEqual({
      counts: { 2: 4, 4: 2 }, votedOut: 2, status: 'continues_after_protocol',
    });
    const five = VOTE_PLANS[3];
    expect(calculateVoteResult(five, 5).status).toBe('black_win_after_protocol');
    expect(calculateVoteResult(five, 1).status).toBe('continues_after_protocol');
  });

  it('rejects physically impossible snapshots, votes for self, missing hands and unknown candidates', () => {
    const plan = VOTE_PLANS[0];
    const invalid = [
      { ...plan, alive: [1, 1, 3, 4, 5] },
      { ...plan, black: [2, 4, 5] },
      { ...plan, candidates: [2, 2] as [number, number] },
      { ...plan, otherVotes: { ...plan.otherVotes, 1: 1 } },
      { ...plan, otherVotes: { 1: 2, 2: 4 } },
      { ...plan, otherVotes: { ...plan.otherVotes, 7: 4 } },
      { ...plan, decidingPlayer: 2 },
    ];
    invalid.forEach((candidate) => expect(() => calculateVoteResult(candidate, 4)).toThrow());
    expect(() => calculateVoteResult(plan, 9)).toThrow();
  });

  it('uses only reviewed facts and gives each step a unique best, defended answer', () => {
    expect(REASONING_LABS.map((topic) => topic.id)).toEqual(['vote', 'hypotheses', 'timeline', 'pressure', 'action', 'decide']);
    for (const topic of REASONING_LABS) {
      expect(topic.cases.length).toBeGreaterThanOrEqual(2);
      expect(new Set(topic.cases.map((item) => item.id)).size).toBe(topic.cases.length);
      for (const item of topic.cases) {
        expect(item.steps.length).toBeGreaterThanOrEqual(2);
        for (const step of item.steps) {
          expect(step.facts.length).toBeGreaterThan(0);
          expect(step.options).toHaveLength(3);
          expect(step.options.filter((option) => option.points === 2)).toHaveLength(1);
          expect(step.options.some((option) => option.points === 0)).toBe(true);
          expect(step.options.every((option) => option.why.length > 25)).toBe(true);
        }
      }
      for (let attempt = 0; attempt < 6; attempt++) {
        const batch = labCasesForAttempt(topic, attempt);
        expect(batch).toHaveLength(2);
        expect(batch[0].id).not.toBe(batch[1].id);
        expect(labCasesForAttempt(topic, attempt)).toEqual(batch);
      }
    }
    expect(REASONING_LABS.find((item) => item.id === 'timeline')?.cases[1].steps[0].facts.join(' '))
      .not.toContain('№6 тоже вскрылся');
    expect(REASONING_LABS.find((item) => item.id === 'timeline')?.cases[1].steps[1].facts.join(' '))
      .not.toContain('установлен настоящий шериф');
  });

  it('keeps the five original chapters separate and opens advanced practice as its own screen', () => {
    render(<MafiaReasoningCourse />);
    expect(screen.getByTestId('reasoning-level-facts')).toBeTruthy();
    fireEvent.click(screen.getByTestId('reasoning-open-labs'));
    expect(screen.queryByTestId('reasoning-level-facts')).toBeNull();
    expect(screen.getByTestId('reasoning-labs-topics')).toBeTruthy();
    expect(screen.getAllByTestId(/reasoning-lab-topic-/)).toHaveLength(6);
    fireEvent.click(screen.getByTestId('reasoning-lab-topic-vote'));
    expect(screen.queryByTestId('reasoning-labs-topics')).toBeNull();
    expect(screen.getByTestId('reasoning-labs-task')).toBeTruthy();
    expect(screen.getByText(/Перед голосованием/)).toBeTruthy();
    const board = screen.getByTestId('reasoning-vote-board');
    expect(board.textContent).toContain('Кандидат №2');
    expect(board.textContent).toContain('Кандидат №4');
    expect(board.textContent).toContain('Рук: 2');
    expect(screen.getByTestId('reasoning-labs-task').textContent).not.toContain('Сравни последствия');
    fireEvent.click(screen.getByTestId('reasoning-labs-back'));
    expect(screen.getByTestId('reasoning-labs-topics')).toBeTruthy();
    fireEvent.click(screen.getByTestId('reasoning-labs-back'));
    expect(screen.getByTestId('reasoning-level-facts')).toBeTruthy();
  });

  it('persists steps without leaking future facts and resumes after re-mount', () => {
    const enter = () => {
      fireEvent.click(screen.getByTestId('reasoning-open-labs'));
      fireEvent.click(screen.getByTestId('reasoning-lab-topic-timeline'));
    };
    render(<MafiaReasoningCourse />);
    enter();
    expect(screen.getByTestId('reasoning-labs-task').textContent).toContain('Вопрос 1 из 6');
    expect(screen.getByTestId('reasoning-labs-task').textContent).not.toContain('Теперь известно');
    fireEvent.change(screen.getByPlaceholderText('Что произошло и почему?'), { target: { value: 'Пока только слова' } });
    fireEvent.click(screen.getByRole('button', { name: /Сравнить с вариантами/ }));
    fireEvent.click(screen.getByTestId('reasoning-lab-option-0'));
    fireEvent.click(screen.getByRole('button', { name: 'Разобрать ответ' }));
    expect(screen.getByRole('status').textContent).toContain('Своя версия: Пока только слова');
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByTestId('reasoning-labs-task').textContent).toContain('Вопрос 2 из 6');
    expect(screen.getByTestId('reasoning-labs-task').textContent).toContain('Голосование');
    const saved = JSON.parse(window.localStorage.getItem('mafia-reasoning-labs-v1') || '{}');
    expect(saved.answers.timeline).toEqual([0]);
    cleanup();
    render(<MafiaReasoningCourse />);
    enter();
    expect(screen.getByTestId('reasoning-labs-task').textContent).toContain('Вопрос 2 из 6');
  });

  it('offers a compact review and a new selection after completing two cases', () => {
    render(<MafiaReasoningCourse />);
    fireEvent.click(screen.getByTestId('reasoning-open-labs'));
    fireEvent.click(screen.getByTestId('reasoning-lab-topic-vote'));
    for (let index = 0; index < 4; index++) {
      fireEvent.click(screen.getByTestId('reasoning-lab-option-0'));
      fireEvent.click(screen.getByRole('button', { name: 'Разобрать ответ' }));
      fireEvent.click(screen.getByRole('button', { name: index === 3 ? 'Результат' : 'Дальше' }));
    }
    expect(screen.getByTestId('reasoning-labs-result')).toBeTruthy();
    expect(screen.getByTestId('reasoning-labs-result').textContent).toContain('из 8');
    fireEvent.click(screen.getByRole('button', { name: 'Другие ситуации' }));
    expect(screen.getByTestId('reasoning-labs-task').textContent).toContain('Вопрос 1 из 4');
    expect(JSON.parse(window.localStorage.getItem('mafia-reasoning-labs-v1') || '{}').attempts.vote).toBe(1);
  });
  it('makes the learner count the hands: every answer of the first step is a real tally, only one is right', () => {
    const topic = REASONING_LABS.find((item) => item.id === 'vote')!;
    topic.cases.forEach((labCase, index) => {
      const plan = VOTE_PLANS[index];
      const [first, last] = plan.candidates;
      const counts = calculateVoteResult(plan, last).counts;
      const options = labCase.steps[0].options;
      expect(options.every((option) => /^Счёт \d+:\d+/.test(option.label))).toBe(true);
      expect(new Set(options.map((option) => option.label)).size).toBe(3);
      expect(options.filter((option) => option.points === 2).map((option) => option.label.split(' (')[0]))
        .toEqual([`Счёт ${counts[first]}:${counts[last]}`]);
    });
  });
  it('«Решить и высказаться»: six cases where committing on a stated basis beats staying passive, which beats a reckless move', () => {
    const topic = REASONING_LABS.find((item) => item.id === 'decide')!;
    expect(topic.title).toBe('Решить и высказаться');
    expect(topic.cases).toHaveLength(6);
    for (const item of topic.cases) {
      expect(item.steps).toHaveLength(2);
      for (const step of item.steps) {
        // exactly one committed answer, one cautious-but-weaker, one reckless or mechanically wrong
        expect(step.options.map((option) => option.points).sort()).toEqual([0, 1, 2]);
      }
    }
    // The mechanics the cases rely on: four hands of six already decide the vote even if both others go to the last candidate.
    const hands = topic.cases.find((item) => item.id === 'decide-hands')!;
    expect(hands.steps[1].options.find((option) => option.points === 2)!.label).toContain('4:2');
    expect(hands.steps[1].facts.join(' ')).toContain('четыре руки из шести');
    // Abstaining is not possible: the unspent hand goes to the last candidate.
    expect(hands.steps[0].options.find((option) => option.points === 0)!.why).toContain('уходит последнему кандидату');
  });
});
