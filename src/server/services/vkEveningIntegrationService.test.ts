import { describe, expect, it } from 'vitest';
import {
  VK_POLL_OPTIONS,
  buildVkPollAnswerMap,
  canVkVoteOverride,
  mapVkPollAnswer,
  parseVkPollVoteCallback,
  resolveVkResponseStatuses,
} from './vkEveningIntegrationService.ts';

describe('VK evening integration helpers', () => {
  it('maps the four VK poll options to canonical evening responses', () => {
    const poll = {
      id: 10,
      owner_id: -20,
      question: 'Идёшь?',
      answers: VK_POLL_OPTIONS.map((option, index) => ({ id: index + 101, text: option.text })),
    };
    const map = buildVkPollAnswerMap(poll);
    expect(mapVkPollAnswer(map, 101)).toBe('going');
    expect(mapVkPollAnswer(map, 102)).toBe('late');
    expect(mapVkPollAnswer(map, 103)).toBe('thinking');
    expect(mapVkPollAnswer(map, 104)).toBe('declined');
    expect(mapVkPollAnswer(map, 999)).toBeNull();
  });

  it('parses VK callback payloads with the nested object shape', () => {
    expect(parseVkPollVoteCallback({ object: { object: { owner_id: -7, poll_id: 8, option_id: 9, user_id: 10 } } })).toEqual({
      ownerId: -7,
      pollId: 8,
      answerId: 9,
      userId: '10',
    });
  });

  it('does not let an older VK vote overwrite a newer response from another source', () => {
    expect(canVkVoteOverride('unanswered', [])).toBe(true);
    expect(canVkVoteOverride('going', ['going'])).toBe(true);
    expect(canVkVoteOverride('declined', ['going'])).toBe(false);
  });

  it('detects conflicting votes from public and channel destinations', () => {
    expect(resolveVkResponseStatuses(['going', 'going'])).toEqual({ status: 'going', conflict: false });
    expect(resolveVkResponseStatuses(['going', 'thinking'])).toEqual({ status: null, conflict: true });
  });
});
