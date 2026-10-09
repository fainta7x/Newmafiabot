import { describe, expect, it } from 'vitest';
import { assignmentMistakes, explainPairRule, explainPersonalPairVote } from '../lib/splitTrainingFeedback.ts';
import { correctSplitVote, splitVoteAssignments, type SplitVoteScenario } from '../lib/splitVoteTraining.ts';

describe('split trainer explanations', () => {
  it('explains a vote involving the first seat without changing the result', () => {
    const early: SplitVoteScenario = { candidates: [1, 3], pair: [1, 3], seat: 6 };
    const late: SplitVoteScenario = { candidates: [1, 7], pair: [1, 7], seat: 4 };
    expect(correctSplitVote(early)).toBe(1);
    expect(explainPersonalPairVote(early)).toContain('голос в 1');
    expect(correctSplitVote(late)).toBe(7);
    expect(explainPersonalPairVote(late)).toContain('голос в 7');
  });
  it('describes cross-half and same-half wrapping correctly', () => {
    expect(explainPairRule([3, 8])).toContain('разных половин');
    expect(explainPairRule([7, 9])).toContain('после 10 снова идёт 1');
  });
  it('finds the exact misplaced hand without changing the underlying canonical solution', () => {
    const scenario: SplitVoteScenario = { candidates: [1, 3, 6], pair: [1, 3], seat: 8 };
    const correct = splitVoteAssignments(scenario);
    const actual = { ...correct, 1: correct[1].filter((n) => n !== 6), 3: [...correct[3], 6] };
    expect(assignmentMistakes(correct, actual, [1,2,3,4,5,6,7,8,9,10])).toEqual(['Игрок 6: поставил руку в 3, а нужно в 1.']);
    expect(splitVoteAssignments(scenario)).toEqual(correct);
  });
});
