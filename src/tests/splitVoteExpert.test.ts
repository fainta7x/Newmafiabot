import { describe, expect, it } from 'vitest';
import { seatList } from '../lib/splitVoteTraining.ts';
import {
  checkExpertAnswer, completeExpertAnswer, generateExpertExam, generateExpertScenario, isValidExpertScenario, solveExpert,
  type ExpertScenario,
} from '../lib/splitVoteExpert.ts';

// Deterministic pseudo-random numbers for repeatable generation.
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('expert split-vote: rescuing a broken split', () => {
  it('rescues a stray vote: 2,1,4,3, split 1 and 3, №4 voted for №2 by mistake', () => {
    const scenario: ExpertScenario = { candidates: [2, 1, 4, 3], pair: [1, 3], broken: { kind: 'stray', votes: [{ nominee: 2, voter: 4 }] } };
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
    expect(isValidExpertScenario({ candidates: [2, 1, 3], pair: [1, 3], broken: { kind: 'stray', votes: [{ nominee: 2, voter: 4 }] } })).toBe(false);
    expect(isValidExpertScenario({ candidates: [1, 2, 3, 4], pair: [1, 3], broken: { kind: 'short', nominee: 1, voters: [7, 8, 9, 10] } })).toBe(false);
  });

  it('varies the break: short votes and 1–3 wrong votes for one or several nominees', () => {
    const random = seeded(11);
    const seen = { short: 0, stray: new Set<number>(), severalNominees: 0 };
    for (let index = 0; index < 1000; index += 1) {
      const { broken } = generateExpertScenario(random, index % 5 !== 0);
      if (broken.kind === 'short') { seen.short += 1; continue; }
      seen.stray.add(broken.votes.length);
      if (new Set(broken.votes.map((vote) => vote.nominee)).size > 1) seen.severalNominees += 1;
    }
    expect(seen.short).toBeGreaterThan(100);
    expect([...seen.stray].sort()).toEqual([1, 2, 3]);
    expect(seen.severalNominees).toBeGreaterThan(10);
  });

  it('rescues two wrong votes for different nominees', () => {
    // 5, 2, 1, 7, 3 — split №1/№3; №4 voted for №5 and №8 for №2 by mistake. Both were in №1's group
    // (№2–6) and №3's group (№1, №7–10): 4 left for №1, 4 left for №3 — the split holds without insurance.
    const scenario: ExpertScenario = { candidates: [5, 2, 1, 7, 3], pair: [1, 3], broken: { kind: 'stray', votes: [{ nominee: 5, voter: 4 }, { nominee: 2, voter: 8 }] } };
    expect(isValidExpertScenario(scenario)).toBe(true);
    expect(checkExpertAnswer(scenario, { 1: [2, 3, 5, 6], 7: [], 3: [1, 7, 9, 10] }).ok).toBe(true);
  });

  it('writes voters the club way: one after another, 10 as «0»', () => {
    expect(seatList([3, 4, 6, 10])).toBe('3460');
    expect(seatList([1, 7, 8, 9, 10])).toBe('17890');
    // Tap order does not matter: always in seat order, 10 last.
    expect(seatList([6, 10, 8, 7, 9])).toBe('67890');
  });
});
