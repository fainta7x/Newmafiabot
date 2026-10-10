// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MafiaReasoningCourse, { reasoningScore, reasoningUnlocked } from '../components/public/guide/MafiaReasoningCourse.tsx';
import {
  REASONING_LEVELS, reasoningCasesForAttempt, reasoningMaxPoints, reasoningPassed,
} from '../lib/mafiaReasoningCourse.ts';

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

const decisions = (cases: typeof REASONING_LEVELS[number]['cases']) => cases.flatMap((item) => item.steps);
const chooseAnswer = (points: 0 | 1 | 2) => {
  const buttons = screen.getAllByTestId(/^reasoning-option-/);
  // The course always contains exactly one answer worth 2 points; for wrong answers choose the first 0.
  const currentQuestion = screen.getByRole('group');
  expect(currentQuestion).toBeTruthy();
  const choices = buttons.map((button) => button.textContent || '');
  return { buttons, choices, points };
};
const complete = (levelIndex: number, point: 0 | 2) => {
  const level = REASONING_LEVELS[levelIndex];
  const cases = reasoningCasesForAttempt(level, 0);
  for (const question of decisions(cases)) {
    const index = question.options.findIndex((answer) => answer.points === point);
    fireEvent.click(screen.getByTestId('reasoning-option-' + index));
    fireEvent.click(screen.getByRole('button', { name: 'Разобрать ответ' }));
    expect(screen.getByRole('status').textContent).toContain(point === 2 ? 'Хорошо подмечено' : 'Здесь есть ошибка');
    fireEvent.click(screen.getByRole('button', { name: /Следующий вопрос|Посмотреть разбор главы/ }));
  }
};

describe('Mafia reasoning: case bank and plain language', () => {
  it('contains 10 diverse first-chapter situations and keeps all other levels intact', () => {
    expect(REASONING_LEVELS).toHaveLength(5);
    expect(REASONING_LEVELS[0].cases).toHaveLength(10);
    expect(REASONING_LEVELS.slice(1).every((level) => level.cases.length === 3)).toBe(true);
    const allCases = REASONING_LEVELS.flatMap((level) => level.cases);
    expect(new Set(allCases.map((item) => item.id)).size).toBe(allCases.length);
    for (const item of allCases) {
      expect(item.facts.length).toBeGreaterThan(1);
      expect(item.steps).toHaveLength(2);
      for (const decision of item.steps) {
        expect(decision.options).toHaveLength(3);
        expect(decision.options.filter((option) => option.points === 2)).toHaveLength(1);
        expect(decision.options.some((option) => option.points === 0)).toBe(true);
        expect(decision.options.every((option) => option.feedback.length > 25)).toBe(true);
      }
    }
    const allCopy = allCases.flatMap((item) => [
      item.title, ...item.facts, ...item.steps.flatMap((step) => [step.prompt, ...step.options.flatMap((option) => [option.label, option.feedback])]),
    ]).join('\n');
    expect(allCopy).not.toMatch(/\b[шсдвп]естёрк[ауеои]|семёрк[ауеои]|десятк[ауеои]/i);
    expect(allCopy).not.toMatch(/голосовал\s+за\s+вывод\s+№/i);
    expect(reasoningUnlocked(0, [])).toBe(true);
    expect(reasoningUnlocked(1, [])).toBe(false);
  });

  it('rotates different sets of five cases and covers the whole bank in two runs', () => {
    const level = REASONING_LEVELS[0];
    const first = reasoningCasesForAttempt(level, 0).map((item) => item.id);
    const second = reasoningCasesForAttempt(level, 1).map((item) => item.id);
    expect(first).toHaveLength(5);
    expect(second).toHaveLength(5);
    expect(first).not.toEqual(second);
    expect(new Set([...first, ...second]).size).toBe(10);
    for (const index of [0, 1, 2, 3, 4, 5]) {
      const batch = reasoningCasesForAttempt(level, index);
      expect(batch).toHaveLength(5);
      expect(new Set(batch.map((item) => item.id)).size).toBe(5);
    }
    expect(reasoningMaxPoints(level)).toBe(20);
    expect(reasoningMaxPoints(REASONING_LEVELS[1])).toBe(12);
    expect(reasoningPassed(17, level)).toBe(true);
    expect(reasoningPassed(16, level)).toBe(false);
  });

  it('scores analysis over color-guessing and keeps each stage locked until passed', () => {
    const level = REASONING_LEVELS[0];
    const questions = decisions(reasoningCasesForAttempt(level, 0));
    const strong = questions.map((item) => item.options.findIndex((option) => option.points === 2));
    const traps = questions.map((item) => item.options.findIndex((option) => option.points === 0));
    expect(reasoningScore(level, strong)).toBe(20);
    expect(reasoningScore(level, traps)).toBe(0);
    expect(reasoningUnlocked(1, ['facts'])).toBe(true);
    expect(reasoningUnlocked(4, ['facts', 'motives', 'team'])).toBe(false);
  });

  it('works on all five first-chapter situations and saves the passed result', () => {
    const finished = vi.fn();
    render(<MafiaReasoningCourse onCourseComplete={finished} />);
    expect(screen.getByText(/В банке 10 ситуаций/)).toBeTruthy();
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(true);
    complete(0, 2);
    expect(screen.getByTestId('reasoning-result').textContent).toContain('20 из 20');
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(false);
    expect(finished).not.toHaveBeenCalled();
    cleanup();
    render(<MafiaReasoningCourse />);
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(false);
    expect(screen.getByTestId('reasoning-result').textContent).toContain('20 из 20');
  });

  it('explains mistakes without unlocking and offers different scenarios when retried', () => {
    render(<MafiaReasoningCourse />);
    expect(screen.getByText('Игрок №10 говорит уверенно')).toBeTruthy();
    complete(0, 0);
    expect(screen.getByTestId('reasoning-review').textContent).toContain('Что стоит переосмыслить');
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('reasoning-result').textContent).toContain('0 из 20');
    fireEvent.click(screen.getByRole('button', { name: 'Другие ситуации' }));
    expect(screen.getByTestId('reasoning-task').textContent).toContain('Вопрос 1 из 10');
    expect(screen.getByText('Выставил — не значит проголосовал')).toBeTruthy();
    cleanup();
    render(<MafiaReasoningCourse />);
    expect(screen.getByText('Выставил — не значит проголосовал')).toBeTruthy();
  });

  it('preserves old in-progress first-chapter answers without moving them to different cases', () => {
    window.localStorage.setItem('mafia-reasoning-course-v1', JSON.stringify({
      answers: { facts: [1, 0, 1] }, passed: [], best: {},
    }));
    render(<MafiaReasoningCourse />);
    expect(screen.getByText(/В банке 10 ситуаций/)).toBeTruthy();
    expect(screen.getByTestId('reasoning-task').textContent).toContain('Вопрос 4 из 6');
  });

  it('does not unlock later chapters from invalid saved progress', () => {
    window.localStorage.setItem('mafia-reasoning-course-v1', JSON.stringify({ passed: ['motives', 'teams'] }));
    render(<MafiaReasoningCourse />);
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('reasoning-level-teams').hasAttribute('disabled')).toBe(true);
  });
});
