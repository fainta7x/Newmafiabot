import { describe, expect, it } from 'vitest';
import { needsCurrentCommunicationAttention } from '../server/routes/tableScoutingRoutes';

describe('command center communication attention', () => {
  it('ignores stale tracked players who are no longer in the current evening audience', () => {
    expect(needsCurrentCommunicationAttention({ eligible_now: false, attention_status: 'failed' })).toBe(false);
    expect(needsCurrentCommunicationAttention({ eligible_now: false, attention_status: 'not_sent' })).toBe(false);
    expect(needsCurrentCommunicationAttention({ eligible_now: false, attention_status: 'unanswered' })).toBe(false);
  });

  it('keeps only current eligible players who still need communication attention', () => {
    expect(needsCurrentCommunicationAttention({ eligible_now: true, attention_status: 'failed' })).toBe(true);
    expect(needsCurrentCommunicationAttention({ eligible_now: true, attention_status: 'not_sent' })).toBe(true);
    expect(needsCurrentCommunicationAttention({ eligible_now: true, attention_status: 'unanswered' })).toBe(true);
    expect(needsCurrentCommunicationAttention({ eligible_now: true, attention_status: 'answered' })).toBe(false);
  });
});
