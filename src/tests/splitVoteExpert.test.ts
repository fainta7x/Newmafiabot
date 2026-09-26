import { describe, expect, it } from 'vitest';
import {
  checkExpertAnswer, completeExpertAnswer, generateExpertExam, generateExpertScenario, isValidExpertScenario, solveExpert,
  type ExpertScenario,
} from '../lib/splitVoteExpert.ts';

// Deterministic pseudo-random numbers for repeatable generation.
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('expert split-vote: rescuing a broken split', () => {
  it('rescues a stray vote: 2,1,4,3, split 1 and 3, №4 voted for №2 by mistake', () => {
    const scenario: ExpertScenario = { candidates: [2, 1, 4, 3], pair: [1, 3], broken: { kind: 'stray', nominee: 2, voter: 4 } };
    // One player of №3's group insures on №4; everyone else votes by the rules: 4 : 4.
    expect(checkExpertAnswer(scenario, { 1: [2, 3, 5, 6], 4: [7], 3: [1, 8, 9, 10] }).ok).toBe(true);
    // Who insures does not matter.
    expect(checkExpertAnswer(scenario, { 1: [2, 3, 5, 6], 4: [10] }).ok).toBe(true);
    // Without insurance the split fails 4 : 5.
    const plain = checkExpertAnswer(scenario, { 1: [2, 3, 5, 6], 4: [], 3: [1, 7, 8, 9, 10] });
    expect(plain.ok).toBe(false);
    expect(plain.totals).toMatchObject({ 1: 4, 3: 5 });
    // A player may not switch to the other pair nominee.
    expect(checkExpertAnswer(scenario, { 1: [2, 3, 5, 6, 7], 4: [8, 9] }).ok).toBe(false);
  });

  it('rescues a short vote: 1,2,3,4, split 1 and 3, only four voted for №1', () => {
    const scenario: ExpertScenario = { candidates: [1, 2, 3, 4], pair: [1, 3], broken: { kind: 'short', nominee: 1, voters: [2, 3, 4, 6] } };
    // №5 missed his vote and must insure; one more from №3's group insures: 4 : 4.
    expect(checkExpertAnswer(scenario, { 2: [5], 3: [1, 7, 8, 9], 4: [10] }).ok).toBe(true);
    // Unassigned players go to the last nominee (№4) automatically.
    expect(completeExpertAnswer(scenario, { 2: [5], 3: [1, 7, 8, 9] })[4]).toEqual([10]);
    expect(checkExpertAnswer(scenario, { 2: [5], 3: [1, 7, 8, 9] }).ok).toBe(true);
    expect(checkExpertAnswer(scenario, { 3: [1, 5, 7, 8] }).ok).toBe(false);
  });

  it('generates only rescuable tasks with 3–5 nominees, and the shown solution passes', () => {
    const random = seeded(7);
    for (let index = 0; index < 1000; index += 1) {
      const scenario = generateExpertScenario(random, index % 5 !== 0);
      expect(scenario.candidates.length).toBeGreaterThanOrEqual(3);
      expect(scenario.candidates.length).toBeLessThanOrEqual(5);
      expect(scenario.pair.includes(1)).toBe(index % 5 !== 0);
      expect(isValidExpertScenario(scenario)).toBe(true);
      const solution = solveExpert(scenario)!;
      expect(checkExpertAnswer(scenario, solution).ok).toBe(true);
    }
  });

  it('builds an exam of five broken splits, four of them with №1', () => {
    const exam = generateExpertExam(seeded(3));
    expect(exam).toHaveLength(5);
    expect(exam.filter((scenario) => scenario.pair.includes(1))).toHaveLength(4);
  });

  it('rejects impossible or malformed tasks', () => {
    // 2,1,3 with a stray vote on №2: nine votes cannot be split evenly and nobody is left to insure on.
    expect(isValidExpertScenario({ candidates: [2, 1, 3], pair: [1, 3], broken: { kind: 'stray', nominee: 2, voter: 4 } })).toBe(false);
    expect(isValidExpertScenario({ candidates: [1, 2, 3, 4], pair: [1, 3], broken: { kind: 'short', nominee: 1, voters: [7, 8, 9, 10] } })).toBe(false);
  });
});
