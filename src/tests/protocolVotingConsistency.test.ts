import { describe, expect, it } from 'vitest';
import { validateProtocolVoting, validateVotes } from '../lib/protocolVotingValidation.ts';
import { validateProtocolVoting as validateForm } from '../components/crm/tournaments/protocol/protocolValidationUtils.ts';

const vote = (overrides: Record<string, unknown> = {}) => ({
  round_number: 1, day_number: 1, is_revote: false,
  nominated_seats: [2, 5], vote_counts: { 2: 6, 5: 4 }, eligible_voters: 10,
  outcome: 'single_eliminated', eliminated_seats: [2], ...overrides,
});

describe('shared tournament voting rules', () => {
  it('allows subsequent disciplinary removal of a voted-out player in both API and form', () => {
    const players = [{ participant_id: 'p2', seat_number: 2, exit_type: 'removed', removal_reason: 'direct' }];
    expect(validateVotes([vote()], true, players, null)).toBeNull();
    expect(validateForm([vote()], players, null).errorMsg).toBeNull();
    expect(validateForm([vote()], [{ ...players[0], removal_reason: null }], null).errorMsg).toContain('статус ухода');
  });

  it.each([
    [vote({ is_revote: undefined })],
    [vote({ nominated_seats: [2, 2] })],
    [vote({ is_revote: true, parent_round_number: 99 })],
    [vote({ outcome: 'no_elimination' })],
    [vote({ vote_counts: { 2: 5, 5: 4 } })],
  ])('rejects the same malformed round before API submission', (round) => {
    const votes = [round];
    const apiError = validateVotes(votes, true, [], null);
    expect(apiError).toBeTruthy();
    expect(validateForm(votes, [], null)).toEqual({ errorMsg: apiError, roundIndexWithError: 0 });
  });

  it('preserves the failing second-round index and draft/completion distinction', () => {
    const pending = vote({ round_number: 2, day_number: 2, outcome: 'pending', eliminated_seats: [] });
    expect(validateVotes([pending], false)).toBeNull();
    const result = validateProtocolVoting([vote(), pending]);
    expect(result.roundIndexWithError).toBe(1);
    expect(result.errorMsg).toContain('не подтверждён');
  });
});
