// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MafiaReasoningCourse from '../components/public/guide/MafiaReasoningCourse.tsx';
import {
  TREE_SCENARIOS, validateTreeScenario, availableVotes, pendingVoters,
  evaluateVotes, exploreVotes, outcomeSummary, treeScenarioForAttempt,
} from '../lib/mafiaReasoningDecisionTree.ts';
import { CHECK_CRITERIA, DIAGNOSTIC_CASES, diagnosticForAttempt } from '../lib/mafiaReasoningDiagnostic.ts';

beforeEach(() => window.localStorage.clear());
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });
const enter = (button: 'tree' | 'diagnostic') => {
  fireEvent.click(screen.getByTestId('reasoning-open-labs'));
  fireEvent.click(screen.getByTestId('reasoning-lab-open-' + button));
};

describe('Sports Mafia decision tree and unguided reasoning check', () => {
  it('exhaustively explores all legal remaining votes and distinguishes possible from inevitable outcomes', () => {
    expect(TREE_SCENARIOS).toHaveLength(5);
    for (const scenario of TREE_SCENARIOS) {
      expect(() => validateTreeScenario(scenario)).not.toThrow();
      const leaves = exploreVotes(scenario);
      expect(leaves.length).toBeGreaterThanOrEqual(2);
      expect(new Set(leaves.map((x) => JSON.stringify(x.votes))).size).toBe(leaves.length);
      for (const leaf of leaves) {
        expect(Object.values(leaf.votes)).toHaveLength(scenario.alive.length);
        expect(Object.values(leaf.counts).reduce((a, b) => a + b, 0)).toBe(scenario.alive.length);
        for (const voter of scenario.firstHands) expect(leaf.votes[voter]).toBe(scenario.nominated[0]);
        const choices = Object.fromEntries(pendingVoters(scenario).map((voter) => [voter, leaf.votes[voter]]));
        expect(evaluateVotes(scenario, choices)).toEqual(leaf);
      }
    }
    const possible = outcomeSummary(exploreVotes(TREE_SCENARIOS[0]));
    expect(possible).toEqual({
      alternatives: 8, possible: ['continue', 'black_win'],
      forced: null, winners: [2, 4],
    });
    const inevitable = outcomeSummary(exploreVotes(TREE_SCENARIOS[1]));
    expect(inevitable.forced).toBe('black_win');
    expect(inevitable.alternatives).toBe(8);
    const six = outcomeSummary(exploreVotes(TREE_SCENARIOS[2]));
    expect(six.possible).toContain('revote');
    expect(six.forced).toBeNull();
    const five = outcomeSummary(exploreVotes(TREE_SCENARIOS[4]));
    expect(five.possible).toContain('red_win');
    expect(five.possible).toContain('continue');
  });

  it('locks hands already cast without inventing a self-vote prohibition', () => {
    const scenario = TREE_SCENARIOS[0];
    expect(pendingVoters(scenario)).toEqual([2, 3, 5]);
    expect(availableVotes(scenario, 2)).toEqual([2, 4]);
    expect(availableVotes(scenario, 3)).toEqual([2, 4]);
    expect(availableVotes(scenario, 1)).toEqual([]);
    expect(exploreVotes(scenario, { 2: 4, 3: 4 })).toHaveLength(2);
    expect(() => exploreVotes(scenario, { 1: 4 })).toThrow();
    expect(exploreVotes(scenario, { 2: 2 })).toHaveLength(4);
    expect(() => evaluateVotes(scenario, { 2: 4 })).toThrow();
    for (const invalid of [
      { ...scenario, alive: [1, 1, 3, 4, 5] },
      { ...scenario, firstHands: [1, 1] },
      { ...scenario, firstHands: [1, 11] },
      { ...scenario, black: [2, 3, 5] },
      { ...scenario, nominated: [2, 2] as [number, number] },
      { ...scenario, black: [11] },
      { ...scenario, alive: [1, 2, 3, 4, 5, 6, 7, 8, 9], black: [2] }, // impossible 8 reds
      { ...scenario, alive: [1, 2, 3, 4, 5, 6, 7, 8, 9], black: [2, 3, 6, 8] }, // four mafias
    ]) expect(() => validateTreeScenario(invalid)).toThrow();
  });

  it('keeps the mechanical and narrative cases varied and reproducible on replay', () => {
    expect(new Set(TREE_SCENARIOS.map((x) => x.id)).size).toBe(TREE_SCENARIOS.length);
    expect(new Set(DIAGNOSTIC_CASES.map((x) => x.id)).size).toBe(DIAGNOSTIC_CASES.length);
    expect(DIAGNOSTIC_CASES).toHaveLength(6);
    expect(CHECK_CRITERIA).toHaveLength(3);
    for (let attempt = 0; attempt < 12; attempt++) {
      expect(treeScenarioForAttempt(attempt)).toBe(TREE_SCENARIOS[attempt % TREE_SCENARIOS.length]);
      const diagnostic = diagnosticForAttempt(attempt);
      expect(diagnostic).toHaveLength(3);
      expect(new Set(diagnostic.map((item) => item.id)).size).toBe(3);
      for (const situation of diagnostic) {
        expect(situation.facts.length).toBeGreaterThanOrEqual(3);
        expect(situation.reference).toHaveLength(3);
        expect(situation.reference.every((piece) => piece.length > 60)).toBe(true);
      }
    }
    expect(diagnosticForAttempt(0).map((x) => x.id)).not.toEqual(diagnosticForAttempt(1).map((x) => x.id));
  });

  it('opens an interactive decision tree without leaking answers before choices, supports undo and preserves state', () => {
    const treeSent: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => { treeSent.push(JSON.parse(String(init?.body))); return { ok: true } as Response; }));
    render(<MafiaReasoningCourse />);
    enter('tree');
    expect(screen.getByTestId('reasoning-tree')).toBeTruthy();
    expect(screen.getByTestId('reasoning-tree-board').textContent).toContain('2 рук пока');
    expect(screen.queryByTestId('reasoning-tree-result')).toBeNull();
    expect(screen.queryByTestId('reasoning-tree-reveal')).toBeNull();
    expect(screen.getByText(/Рука 1 из 3/)).toBeTruthy();
    expect(screen.getByTestId('reasoning-tree-vote-2')).toBeTruthy();
    fireEvent.click(screen.getByTestId('reasoning-tree-vote-4'));
    expect(screen.getByText(/Рука 2 из 3/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('reasoning-tree-vote-2'));
    fireEvent.click(screen.getByTestId('reasoning-tree-undo'));
    expect(screen.getByText(/Рука 2 из 3/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('reasoning-tree-vote-4'));
    cleanup();
    render(<MafiaReasoningCourse />);
    enter('tree');
    expect(screen.getByText(/Рука 3 из 3/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('reasoning-tree-vote-4'));
    expect(screen.queryByTestId('reasoning-tree-result')).toBeNull();
    expect(treeSent).toEqual([{ track: 'reasoning-extra', item: 'tree', passed: true }]);
    fireEvent.click(screen.getByTestId('reasoning-tree-reveal'));
    expect(screen.getByTestId('reasoning-tree-result').textContent).toContain('Победа мафии');
    expect(screen.getByTestId('reasoning-tree-result').textContent).toContain('8 допустимых');
    fireEvent.click(screen.getByText('Следующая ситуация'));
    expect(screen.getByTestId('reasoning-tree').textContent).toContain(TREE_SCENARIOS[1].title);
  });

  it('shows independent assessment references only after a written response, not as automatic scoring', () => {
    render(<MafiaReasoningCourse />);
    enter('diagnostic');
    expect(screen.getByTestId('reasoning-diagnostic-task').textContent).toContain('Ситуация 1 из 3');
    expect(screen.queryByTestId('reasoning-diagnostic-reference')).toBeNull();
    const submit = screen.getByTestId('reasoning-diagnostic-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const fields = ['observed', 'alternatives', 'refutation'];
    for (const field of fields) fireEvent.change(screen.getByTestId('reasoning-diagnostic-' + field), {
      target: { value: 'Моя развёрнутая самостоятельная версия о ситуации' },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(screen.getByTestId('reasoning-diagnostic-reference')).toBeTruthy();
    expect(screen.queryByTestId('reasoning-diagnostic-submit')).toBeNull();
    expect((screen.getByTestId('reasoning-diagnostic-next') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('reasoning-diagnostic-mark-0-true'));
    fireEvent.click(screen.getByTestId('reasoning-diagnostic-mark-1-false'));
    fireEvent.click(screen.getByTestId('reasoning-diagnostic-mark-2-true'));
    expect((screen.getByTestId('reasoning-diagnostic-next') as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    render(<MafiaReasoningCourse />);
    enter('diagnostic');
    expect(screen.getByTestId('reasoning-diagnostic-reference')).toBeTruthy();
    expect(screen.getByTestId('reasoning-diagnostic-mark-0-true').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('reasoning-diagnostic-next'));
    expect(screen.getByTestId('reasoning-diagnostic-task').textContent).toContain('Ситуация 2 из 3');
  });

  it('completes three independent scenarios and reports only learner-checked criteria', () => {
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return { ok: true } as Response; }));
    render(<MafiaReasoningCourse />);
    enter('diagnostic');
    for (let index = 0; index < 3; index++) {
      for (const field of ['observed', 'alternatives', 'refutation']) fireEvent.change(
        screen.getByTestId('reasoning-diagnostic-' + field), { target: { value: 'Разбор своей версии на основании известных фактов' } });
      fireEvent.click(screen.getByTestId('reasoning-diagnostic-submit'));
      for (let mark = 0; mark < 3; mark++) fireEvent.click(screen.getByTestId(`reasoning-diagnostic-mark-${mark}-${mark === 0}`));
      fireEvent.click(screen.getByTestId('reasoning-diagnostic-next'));
    }
    const result = screen.getByTestId('reasoning-diagnostic-result');
    expect(sent).toEqual([{ track: 'reasoning-extra', item: 'diagnostic', score: 3, maxScore: 9, passed: true }]);
    expect(result.textContent).toContain('3 из 9');
    expect(result.textContent).toContain('самостоятельная оценка');
    fireEvent.click(screen.getByRole('button', { name: 'Другие ситуации' }));
    expect(screen.getByTestId('reasoning-diagnostic-task').textContent).toContain(DIAGNOSTIC_CASES[3].title);
  });
});
