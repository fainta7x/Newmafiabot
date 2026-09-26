import { describe, expect, it } from 'vitest';
import {
  completeSplitThreeAnswer, correctSplitThreeVote, generateSplitThreeScenario, isCorrectSplitThreeAssignment,
  isValidSplitThreeScenario, splitThreeAssignments, splitThreeVersions, type SplitThreeScenario,
} from '../lib/splitThreeTraining.ts';
import { seatList } from '../lib/splitVoteTraining.ts';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('three-way split with nine at the table', () => {
  it('follows the club examples', () => {
    // 10 killed, nominated 5, 2, 8: 258 vote for 5, 134 for 2, 679 for 8.
    const easy: SplitThreeScenario = { killed: 10, candidates: [5, 2, 8], split: [5, 2, 8], seat: 3 };
    const groups = splitThreeAssignments(easy);
    expect([seatList(groups[5]), seatList(groups[2]), seatList(groups[8])]).toEqual(['258', '134', '679']);
    expect(correctSplitThreeVote(easy)).toBe(2);
    expect(correctSplitThreeVote({ ...easy, seat: 8 })).toBe(5);

    // 10 killed, nominated 7, 2, 5, 9, 4, split 2, 9, 4: 249 for 2, 135 for 9, 678 for 4, nobody for 7 and 5.
    const medium: SplitThreeScenario = { killed: 10, candidates: [7, 2, 5, 9, 4], split: [2, 9, 4], seat: 1 };
    const assignments = splitThreeAssignments(medium);
    expect(Object.fromEntries(Object.entries(assignments).map(([key, seats]) => [key, seatList(seats)])))
      .toEqual({ 7: '', 2: '249', 5: '', 9: '135', 4: '678' });
    expect(isCorrectSplitThreeAssignment(medium, { 2: [2, 4, 9], 9: [1, 3, 5], 4: [6, 7, 8] })).toBe(true);
    // The last nominee (4) takes whoever did not vote.
    expect(completeSplitThreeAnswer(medium, { 2: [2, 4, 9], 9: [1, 3, 5] })[4]).toEqual([6, 7, 8]);
    expect(isCorrectSplitThreeAssignment(medium, { 2: [2, 4, 9], 9: [1, 3, 5] })).toBe(true);
    expect(isCorrectSplitThreeAssignment(medium, { 2: [2, 4, 9], 9: [1, 3, 6] })).toBe(false);
  });

  it('generates valid tasks for both levels with any killed player', () => {
    const random = seeded(5);
    const killed = new Set<number>();
    for (let index = 0; index < 500; index += 1) {
      const easy = generateSplitThreeScenario('three_easy', undefined, random);
      expect(isValidSplitThreeScenario(easy, 'three_easy')).toBe(true);
      expect(easy.candidates).toEqual(easy.split);
      const medium = generateSplitThreeScenario('three_medium', undefined, random);
      expect(isValidSplitThreeScenario(medium, 'three_medium')).toBe(true);
      expect(medium.candidates.length).toBeGreaterThanOrEqual(4);
      expect(isCorrectSplitThreeAssignment(medium, splitThreeAssignments(medium))).toBe(true);
      killed.add(easy.killed);
    }
    expect(killed.size).toBe(10);
  });

  it('hard level: the user example with two sheriffs', () => {
    // 10 killed, sheriffs 1 and 4, the town trusts 4 less, 4 checked 2 black, 1 checked 6 red; nominated 4, 2, 7.
    const hard: SplitThreeScenario = {
      killed: 10, candidates: [4, 2, 7], split: [4, 2, 7], seat: 3,
      sheriffs: { trusted: { seat: 1, check: 6, black: false }, doubted: { seat: 4, check: 2 } },
    };
    expect(isValidSplitThreeScenario(hard, 'three_hard')).toBe(true);
    expect(splitThreeVersions(hard)).toEqual([
      { sheriff: 1, blacks: [4], into: [2] },
      { sheriff: 4, blacks: [1, 2], into: [4] },
    ]);
    const assignments = splitThreeAssignments(hard);
    expect(Object.fromEntries(Object.entries(assignments).map(([key, seats]) => [key, seatList(seats)]))).toEqual({ 4: '127', 2: '345', 7: '689' });
    // Plain seat order (the medium-level answer) lets 1 or 2 break the split — it is wrong here.
    expect(isCorrectSplitThreeAssignment(hard, { 4: [2, 4, 7], 2: [1, 3, 5], 7: [6, 8, 9] })).toBe(false);
    // The hard-level claims are required and must match the split the town makes.
    expect(isValidSplitThreeScenario({ ...hard, sheriffs: undefined }, 'three_hard')).toBe(false);
    expect(isValidSplitThreeScenario({ ...hard, candidates: [4, 6, 7], split: [4, 6, 7] }, 'three_hard')).toBe(false);
    expect(isValidSplitThreeScenario(hard, 'three_medium')).toBe(false);
  });

  it('hard level: with a black check at each sheriff the split is both checks and the less trusted sheriff', () => {
    const hard: SplitThreeScenario = {
      killed: 10, candidates: [3, 7, 5], split: [3, 7, 5], seat: 1,
      sheriffs: { trusted: { seat: 9, check: 3, black: true }, doubted: { seat: 5, check: 7 } },
    };
    expect(isValidSplitThreeScenario(hard, 'three_hard')).toBe(true);
    // By 9's version 3 and 5 are mafia → into 7; by 5's version 7 and 9 → into 3 (first with a free vote).
    expect(splitThreeAssignments(hard)).toEqual({ 3: [1, 7, 9], 7: [2, 3, 5], 5: [4, 6, 8] });
    expect(isValidSplitThreeScenario({ ...hard, candidates: [3, 7, 1], split: [3, 7, 1] }, 'three_hard')).toBe(false);
  });

  it('hard level: generated tasks always keep the breaking hands on the other version', () => {
    const random = seeded(11);
    for (let index = 0; index < 500; index += 1) {
      const hard = generateSplitThreeScenario('three_hard', undefined, random);
      expect(isValidSplitThreeScenario(hard, 'three_hard')).toBe(true);
      const assignments = splitThreeAssignments(hard);
      expect(hard.split.map((seat) => assignments[seat].length)).toEqual([3, 3, 3]);
      for (const { blacks, into } of splitThreeVersions(hard)) {
        for (const black of blacks) expect(into.some((seat) => assignments[seat].includes(black))).toBe(true);
      }
    }
  });
});
