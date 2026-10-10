// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MafiaReasoningCourse, { reasoningScore, reasoningUnlocked } from '../components/public/guide/MafiaReasoningCourse.tsx';
import { REASONING_LEVELS, reasoningMaxPoints, reasoningPassed } from '../lib/mafiaReasoningCourse.ts';

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe('mafia reasoning curriculum', () => {
  it('has five ordered levels, 15 distinct cases and 30 assessable decisions with meaningful feedback', () => {
    expect(REASONING_LEVELS).toHaveLength(5);
    const ids: string[] = [];
    for (const level of REASONING_LEVELS) {
      expect(level.cases).toHaveLength(3);
      expect(reasoningMaxPoints(level)).toBe(12);
      for (const item of level.cases) {
        ids.push(item.id);
        expect(item.facts.length).toBeGreaterThan(1);
        expect(item.steps).toHaveLength(2);
        for (const decision of item.steps) {
          expect(decision.options).toHaveLength(3);
          expect(decision.options.filter((answer) => answer.points === 2)).toHaveLength(1);
          expect(decision.options.some((answer) => answer.points === 0)).toBe(true);
          for (const option of decision.options) {
            expect(option.feedback.length).toBeGreaterThan(25);
            expect(option.label.length).toBeGreaterThan(10);
          }
        }
      }
    }
    expect(new Set(ids).size).toBe(15);
    expect(reasoningUnlocked(0, [])).toBe(true);
    expect(reasoningUnlocked(1, [])).toBe(false);
    expect(reasoningUnlocked(1, ['facts'])).toBe(true);
    expect(reasoningUnlocked(4, ['facts', 'motives', 'team'])).toBe(false);
  });

  it('scores reasoning quality rather than guessed player colors', () => {
    const level = REASONING_LEVELS[0];
    const questions = level.cases.flatMap((item) => item.steps);
    const strong = questions.map((item) => item.options.findIndex((option) => option.points === 2));
    const traps = questions.map((item) => item.options.findIndex((option) => option.points === 0));
    expect(reasoningScore(level, strong)).toBe(12);
    expect(reasoningScore(level, traps)).toBe(0);
    expect(reasoningPassed(10, level)).toBe(true);
    expect(reasoningPassed(9, level)).toBe(false);
  });

  it('unlocks the next chapter only after completing all decisions with enough points and saves locally', () => {
    const finished = vi.fn();
    const level = REASONING_LEVELS[0];
    render(<MafiaReasoningCourse onCourseComplete={finished} />);
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(true);
    const questions = level.cases.flatMap((item) => item.steps);
    for (const question of questions) {
      const index = question.options.findIndex((answer) => answer.points === 2);
      fireEvent.click(screen.getByTestId('reasoning-option-' + index));
      fireEvent.click(screen.getByRole('button', { name: /Проверить рассуждение/ }));
      expect(screen.getByRole('status').textContent).toContain('Сильное рассуждение');
      fireEvent.click(screen.getByRole('button', { name: /Следующее решение|Посмотреть разбор главы/ }));
    }
    expect(screen.getByTestId('reasoning-result').textContent).toContain('12 из 12');
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(false);
    expect(finished).not.toHaveBeenCalled(); // only complete after chapter five
    cleanup();
    render(<MafiaReasoningCourse />);
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(false);
  });

  it('explains wrong reasoning and refuses to unlock the next chapter', () => {
    const level = REASONING_LEVELS[0];
    render(<MafiaReasoningCourse />);
    const questions = level.cases.flatMap((item) => item.steps);
    for (const question of questions) {
      const index = question.options.findIndex((answer) => answer.points === 0);
      fireEvent.click(screen.getByTestId('reasoning-option-' + index));
      fireEvent.click(screen.getByRole('button', { name: /Проверить рассуждение/ }));
      expect(screen.getByRole('status').textContent).toContain('Логическая ловушка');
      expect(screen.getByRole('status').textContent).toContain('Сильнее:');
      fireEvent.click(screen.getByRole('button', { name: /Следующее решение|Посмотреть разбор главы/ }));
    }
    expect(screen.getByTestId('reasoning-result').textContent).toContain('0 из 12');
    expect(screen.getByTestId('reasoning-review').textContent).toContain('Что стоит переосмыслить');
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Пройти главу ещё раз/ }));
    expect(screen.getByTestId('reasoning-task').textContent).toContain('Решение 1 из 6');
  });

  it('does not silently unlock levels from a corrupt local cache', () => {
    window.localStorage.setItem('mafia-reasoning-course-v1', JSON.stringify({ passed: ['motives', 'teams'] }));
    render(<MafiaReasoningCourse />);
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('reasoning-level-teams').hasAttribute('disabled')).toBe(true);
  });
});
