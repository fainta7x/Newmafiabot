import { describe, expect, it } from 'vitest';
import { isEveningGameEligible } from '../lib/eveningRoster';

describe('manual evening roster eligibility', () => {
  const participant = (overrides: Record<string, unknown> = {}) => ({
    id: 'ep-1',
    evening_id: 'evening-1',
    player_id: 'player-1',
    nickname: 'Фандорин',
    response_status: 'unanswered',
    registration_status: 'unanswered',
    attendance_status: 'pending',
    arrival_status: 'unknown',
    participation_status: 'playing',
    ...overrides,
  } as any);

  it('keeps a manually confirmed club player selectable before explicit check-in', () => {
    expect(isEveningGameEligible(participant({ response_status: 'going', registration_status: 'going' }))).toBe(true);
    expect(isEveningGameEligible(participant({ response_status: 'late', registration_status: 'late' }))).toBe(true);
  });

  it('keeps an already arrived player selectable', () => {
    expect(isEveningGameEligible(participant({ attendance_status: 'attended', arrival_status: 'on_time' }))).toBe(true);
    expect(isEveningGameEligible(participant({ attendance_status: 'attended', arrival_status: 'late' }))).toBe(true);
  });

  it('does not make thinking, declined, or unanswered people selectable', () => {
    expect(isEveningGameEligible(participant({ response_status: 'thinking', registration_status: 'thinking' }))).toBe(false);
    expect(isEveningGameEligible(participant({ response_status: 'declined', registration_status: 'declined' }))).toBe(false);
    expect(isEveningGameEligible(participant())).toBe(false);
  });
});
