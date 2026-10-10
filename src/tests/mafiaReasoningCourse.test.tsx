// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MafiaReasoningCourse, { reasoningScore, reasoningUnlocked } from '../components/public/guide/MafiaReasoningCourse.tsx';
import {
  REASONING_LEVELS, reasoningCasesForAttempt, reasoningMaxPoints, reasoningPassed, reasoningDecisionPoints, reasoningOptionOrder,
} from '../lib/mafiaReasoningCourse.ts';

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

const decisions = (cases: typeof REASONING_LEVELS[number]['cases']) => cases.flatMap((item) => item.steps);
const complete = (levelIndex: number, point: 0 | 2) => {
  const level = REASONING_LEVELS[levelIndex];
  const cases = reasoningCasesForAttempt(level, 0);
  for (const question of decisions(cases)) {
    const chosen = question.mode === 'multiple'
      ? question.options.flatMap((option, index) => (option.plausible === (point === 2) ? [index] : []))
      : [question.options.findIndex((answer) => answer.points === point)];
    for (const index of chosen) fireEvent.click(screen.getByTestId('reasoning-option-' + index));
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
        expect(decision.options.length).toBeGreaterThanOrEqual(3);
        expect(decision.options.some((option) => option.points === 0)).toBe(true);
        if (decision.mode === 'multiple') {
          expect(decision.options.filter((option) => option.plausible).length).toBeGreaterThanOrEqual(2);
          expect(decision.options.some((option) => option.plausible === false)).toBe(true);
        } else {
          expect(decision.options.filter((option) => option.points === 2)).toHaveLength(1);
        }
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
    const strong = questions.map((item) => item.mode === 'multiple'
      ? item.options.flatMap((option, index) => (option.plausible ? [index] : []))
      : item.options.findIndex((option) => option.points === 2));
    const traps = questions.map((item) => item.mode === 'multiple'
      ? [item.options.findIndex((option) => !option.plausible)]
      : item.options.findIndex((option) => option.points === 0));
    expect(reasoningScore(level, strong)).toBe(20);
    expect(reasoningScore(level, traps)).toBe(0);
    expect(reasoningUnlocked(1, ['facts'])).toBe(true);
    expect(reasoningUnlocked(4, ['facts', 'motives', 'team'])).toBe(false);
  });

  it('opens a chapter as its own view, resumes answered questions and returns to the picker', () => {
    render(<MafiaReasoningCourse />);
    expect(screen.getByRole('heading', { name: 'Игровое мышление' })).toBeTruthy();
    expect(screen.queryByTestId('reasoning-task')).toBeNull();
    expect(screen.queryByText(/Ответы сохраняются только на этом устройстве/)).toBeNull();

    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    expect(screen.getByTestId('reasoning-practice')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Игровое мышление' })).toBeNull();
    expect(screen.queryByTestId('reasoning-level-motives')).toBeNull();
    expect(screen.getByTestId('reasoning-task').textContent).toContain('Вопрос 1 из 10');

    fireEvent.click(screen.getByTestId('reasoning-option-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Разобрать ответ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Следующий вопрос' }));
    expect(screen.getByTestId('reasoning-task').textContent).toContain('Вопрос 2 из 10');

    fireEvent.click(screen.getByTestId('reasoning-back-to-chapters'));
    expect(screen.queryByTestId('reasoning-task')).toBeNull();
    expect(screen.getByTestId('reasoning-level-facts').textContent).toContain('Продолжить · 1/10');
    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    expect(screen.getByTestId('reasoning-task').textContent).toContain('Вопрос 2 из 10');
    cleanup();
    render(<MafiaReasoningCourse />);
    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    expect(screen.getByTestId('reasoning-task').textContent).toContain('Вопрос 2 из 10');
  });

  it('works on all five first-chapter situations and saves the passed result', () => {
    const finished = vi.fn();
    render(<MafiaReasoningCourse onCourseComplete={finished} />);
    expect(screen.getByRole('heading', { name: 'Игровое мышление' })).toBeTruthy();
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(true);
    expect(screen.queryByTestId('reasoning-task')).toBeNull();
    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    expect(screen.getByTestId('reasoning-practice')).toBeTruthy();
    expect(screen.queryByTestId('reasoning-level-motives')).toBeNull();
    complete(0, 2);
    expect(screen.getByTestId('reasoning-result').textContent).toContain('20 из 20');
    expect(finished).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('reasoning-back-to-chapters'));
    expect(screen.queryByTestId('reasoning-result')).toBeNull();
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(false);
    cleanup();
    render(<MafiaReasoningCourse />);
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    expect(screen.getByTestId('reasoning-result').textContent).toContain('20 из 20');
  });

  it('explains mistakes without unlocking and offers different scenarios when retried', () => {
    render(<MafiaReasoningCourse />);
    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    expect(screen.getByText('Игрок №10 говорит уверенно')).toBeTruthy();
    complete(0, 0);
    expect(screen.getByTestId('reasoning-review').textContent).toContain('Разобрать ошибки');
    expect(screen.getByTestId('reasoning-result').textContent).toContain('0 из 20');
    fireEvent.click(screen.getByTestId('reasoning-back-to-chapters'));
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    fireEvent.click(screen.getByRole('button', { name: 'Другие ситуации' }));
    expect(screen.getByTestId('reasoning-task').textContent).toContain('Вопрос 1 из 10');
    expect(screen.getByText('Выставил — не значит проголосовал')).toBeTruthy();
    cleanup();
    render(<MafiaReasoningCourse />);
    expect(screen.getByTestId('reasoning-level-facts')).toBeTruthy();
    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    expect(screen.getByText('Выставил — не значит проголосовал')).toBeTruthy();
  });

  it('preserves old in-progress first-chapter answers without moving them to different cases', () => {
    window.localStorage.setItem('mafia-reasoning-course-v1', JSON.stringify({
      answers: { facts: [1, 0, 1] }, passed: [], best: {},
    }));
    render(<MafiaReasoningCourse />);
    expect(screen.queryByTestId('reasoning-task')).toBeNull();
    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    expect(screen.getByTestId('reasoning-task').textContent).toContain('Вопрос 4 из 6');
  });


  it('treats red-red, black-black and black-red protection as compatible, not proven', () => {
    const facts = REASONING_LEVELS[0].cases.find((item) => item.id === 'votes')!;
    const multi = facts.steps[1];
    expect(multi.mode).toBe('multiple');
    const copy = multi.options.map((option) => option.label).join(' ');
    expect(copy).toContain('мирный и считает №7 мафией');
    expect(copy).toContain('мафия и спасает напарника №2');
    expect(copy).toContain('мафия и сохраняет мирного №2');
    const plausible = multi.options.flatMap((option, i) => option.plausible ? [i] : []);
    expect(reasoningDecisionPoints(multi, plausible)).toBe(2);
    expect(reasoningDecisionPoints(multi, plausible.slice(0, 1))).toBe(1);
    expect(reasoningDecisionPoints(multi, [...plausible, multi.options.findIndex((option) => !option.plausible)])).toBe(0);
    expect(reasoningDecisionPoints(multi, [...plausible, plausible[0]])).toBe(0);
    expect(reasoningDecisionPoints(multi, [])).toBe(0);
  });

  it('balances answer locations with a reproducible display permutation', () => {
    const cases = reasoningCasesForAttempt(REASONING_LEVELS[0], 0);
    const positions = decisions(cases).map((question, index) => {
      const indexInOriginal = question.options.findIndex((option) => option.points === 2);
      const order = reasoningOptionOrder(question, index, 0);
      expect(new Set(order).size).toBe(question.options.length);
      return order.indexOf(indexInOriginal);
    });
    // The first correct choice is not always the second or the longest.
    expect(new Set(positions).size).toBeGreaterThan(2);
    const before = reasoningOptionOrder(decisions(cases)[0], 0, 0);
    const after = reasoningOptionOrder(decisions(cases)[0], 0, 1);
    expect(before).not.toEqual(after);
  });

  it('allows choosing several hypotheses and gives per-option feedback', () => {
    // First batch: "votes" is its third case and starts at decision 6 of 10.
    render(<MafiaReasoningCourse />);
    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    const firstFour = decisions(reasoningCasesForAttempt(REASONING_LEVELS[0], 0)).slice(0, 5);
    for (const question of firstFour) {
      const right = question.options.findIndex((option) => option.points === 2);
      fireEvent.click(screen.getByTestId('reasoning-option-' + right));
      fireEvent.click(screen.getByRole('button', { name: 'Разобрать ответ' }));
      fireEvent.click(screen.getByRole('button', { name: 'Следующий вопрос' }));
    }
    expect(screen.getByText(/Можно выбрать несколько вариантов/)).toBeTruthy();
    const question = REASONING_LEVELS[0].cases.find((item) => item.id === 'votes')!.steps[1];
    const selected = question.options.flatMap((option, i) => option.plausible ? [i] : []);
    for (const index of selected) fireEvent.click(screen.getByTestId('reasoning-option-' + index));
    fireEvent.click(screen.getByRole('button', { name: 'Разобрать ответ' }));
    expect(screen.getByRole('status').textContent).toContain('Хорошо подмечено');
    expect(screen.getByRole('status').textContent).toContain('Возможная версия:');
  });
  it('does not leak the right answer through length and tests plausible cardinalities', () => {
    const normal = REASONING_LEVELS.flatMap((level) => level.cases.flatMap((item) => item.steps))
      .filter((decision) => decision.mode !== 'multiple');
    const longestRight = normal.filter((decision) => {
      const best = decision.options.find((option) => option.points === 2)!;
      return best.label.length >= Math.max(...decision.options.map((option) => option.label.length));
    }).length;
    expect(longestRight).toBeGreaterThan(5);
    expect(longestRight).toBeLessThan(normal.length / 2);

    const multiple = REASONING_LEVELS.flatMap((level) => level.cases.flatMap((item) => item.steps))
      .filter((decision) => decision.mode === 'multiple');
    expect(multiple.length).toBeGreaterThanOrEqual(8);
    expect(new Set(multiple.map((decision) => decision.options.filter((option) => option.plausible).length)).size).toBeGreaterThanOrEqual(2);
  });

  it('invites free self-explanation without pretending to score free text', () => {
    render(<MafiaReasoningCourse />);
    fireEvent.click(screen.getByTestId('reasoning-level-facts'));
    fireEvent.click(screen.getByText('Своя версия (необязательно)'));
    fireEvent.change(screen.getByTestId('reasoning-own-explanation'), { target: { value: 'Я вижу только речь №10, но не его роль' } });
    fireEvent.click(screen.getByTestId('reasoning-option-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Разобрать ответ' }));
    expect(screen.getByTestId('reasoning-own-review').textContent).toContain('не его роль');
    expect(screen.queryByText(/на рейтинг Elo и награды/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий вопрос' }));
    expect((screen.getByTestId('reasoning-own-explanation') as HTMLTextAreaElement).value).toBe('');
  });


  it('does not pretend a claimed Sheriff proves a color before the Sheriff identity is known', () => {
    const caseItem = REASONING_LEVELS[0].cases.find((item) => item.id === 'sheriff-claim')!;
    expect(caseItem.facts.join(' ')).toContain('№8 ещё не выступал');
    expect(caseItem.facts.join(' ')).toContain('неизвестно, настоящий ли №1 шериф');
    expect(caseItem.facts.join(' ')).not.toMatch(/раскрыл.*роль/);

    const [observed, hypotheses] = caseItem.steps;
    expect(observed.mode).toBeUndefined();
    expect(observed.options.filter((option) => option.points === 2).map((option) => option.label))
      .toEqual(['№1 дал чёрную проверку №8']);
    expect(observed.options.some((option) => option.points === 0 && option.label.includes('уже достоверна'))).toBe(true);
    expect(hypotheses.mode).toBe('multiple');
    expect(hypotheses.options.map((option) => option.plausible)).toEqual([true, true, true, false]);
    expect(hypotheses.options[0].label).toContain('настоящий шериф');
    expect(hypotheses.options[1].label).toContain('чёрную проверку красному №8');
    expect(hypotheses.options[2].label).toContain('чёрную проверку чёрному №8');
    expect(hypotheses.options[2].feedback).toContain('окрасниться');
    expect(hypotheses.options[3].label).toContain('даже если №1 лжешериф');
    expect(hypotheses.options[3].feedback).toContain('№8 может быть красным или чёрным');
  });

  it('distinguishes an unconfirmed Sheriff claim from a confirmed real Sheriff check', () => {
    const verified = REASONING_LEVELS.find((level) => level.id === 'reconstruct')!
      .cases.find((item) => item.id === 'sheriff')!;
    expect(verified.facts.join(' ')).toContain('настоящий шериф');
    expect(verified.facts.join(' ')).toContain('№6 действительно чёрный');
    const review = REASONING_LEVELS[0].cases.flatMap((item) => [item.title, ...item.facts]);
    expect(review.join(' ')).not.toContain('свою роль не раскрыл');
  });

  it('uses okrasnenie only for black-player tactics instead of a generic trust shortcut', () => {
    const lines = REASONING_LEVELS.flatMap((level) => level.cases.flatMap((item) =>
      [item.title, ...item.facts, ...item.steps.flatMap((decision) =>
        [decision.prompt, ...decision.options.flatMap((option) => [option.label, option.feedback])])])).join(' ');
    expect(lines).toContain('окрасниться');
    expect(lines).not.toContain('ради доверия');
    expect(lines).not.toContain('получил доверие');
    expect(lines).not.toContain('обвиняет мирного');
    expect(lines).not.toContain('№8 свою роль не раскрыл');
  });

  it('does not unlock later chapters from invalid saved progress', () => {
    window.localStorage.setItem('mafia-reasoning-course-v1', JSON.stringify({ passed: ['motives', 'teams'] }));
    render(<MafiaReasoningCourse />);
    expect(screen.getByTestId('reasoning-level-motives').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('reasoning-level-teams').hasAttribute('disabled')).toBe(true);
  });
});
