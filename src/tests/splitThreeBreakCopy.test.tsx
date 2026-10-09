// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SplitThreeBreakTask } from '../components/public/SplitThreeBreakTask.tsx';
import type { SplitThreeBreakScenario } from '../lib/splitThreeBreak.ts';

afterEach(cleanup);

const renderPrompt = (split: [number, number, number], breaker: number) => {
  const scenario: SplitThreeBreakScenario = {
    killed: 10, candidates: split, split, breaker, seat: 3,
  };
  render(<SplitThreeBreakTask scenario={scenario} onDone={() => undefined} />);
  return screen.getByTestId('split-three-break-message').textContent;
};

describe('broken three-way split prompt', () => {
  it('directly explains who failed to vote and for whom, using the owners example', () => {
    expect(renderPrompt([1, 8, 6], 8)).toBe('Попил сломан! 8 не поставил руку в 1. Что делаем дальше?');
  });

  it('uses the actual first nominee and breaker in another case', () => {
    expect(renderPrompt([4, 9, 2], 9)).toBe('Попил сломан! 9 не поставил руку в 4. Что делаем дальше?');
  });
});
