import { describe, expect, it } from 'vitest';
import { getSortedAddableEvenings } from '../lib/dateUtils.ts';
import { addSingleParticipantSchema, bulkAddParticipantsSchema } from '../server/validation.ts';

describe('manual evening player add', () => {
  it('mirrors canonical response_status into the legacy registration_status used by add routes', () => {
    const bulk = bulkAddParticipantsSchema.parse({ player_ids: ['fandorin'], response_status: 'going', amount_due: 400 });
    expect(bulk.response_status).toBe('going');
    expect(bulk.registration_status).toBe('going');

    const single = addSingleParticipantSchema.parse({ player_id: 'fandorin', response_status: 'going' });
    expect(single.response_status).toBe('going');
    expect(single.registration_status).toBe('going');
  });

  it('keeps an already-started active evening available for a walk-in player', () => {
    const now = Date.parse('2026-08-28T21:30:00+03:00');
    const evenings = [
      { id: 'current', starts_at: '2026-08-28T20:00:00+03:00', status: 'active' },
      { id: 'future', starts_at: '2026-09-04T20:00:00+03:00', status: 'published' },
      { id: 'closed', starts_at: '2026-08-21T20:00:00+03:00', status: 'completed' },
    ];
    expect(getSortedAddableEvenings(evenings, now).map((evening) => evening.id)).toEqual(['current', 'future']);
  });

  it('keeps a just-started published evening available even before its status is switched to active', () => {
    const now = Date.parse('2026-08-28T23:00:00+03:00');
    const evenings = [
      { id: 'walk-in', starts_at: '2026-08-28T20:00:00+03:00', status: 'published' },
      { id: 'stale', starts_at: '2026-08-27T01:00:00+03:00', status: 'published' },
    ];
    expect(getSortedAddableEvenings(evenings, now).map((evening) => evening.id)).toEqual(['walk-in']);
  });
});
