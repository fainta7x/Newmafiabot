import { describe, expect, it } from 'vitest';
import {
  completeSplitThreeAnswer, correctSplitThreeVote, generateSplitThreeScenario, isCorrectSplitThreeAssignment,
  isValidSplitThreeScenario, splitThreeAssignments, type SplitThreeScenario,
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
});
