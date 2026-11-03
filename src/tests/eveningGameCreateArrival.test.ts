import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../components/crm/EveningGameCreateSheet.tsx', import.meta.url), 'utf8');

// «Одно окно» (owner, 2026-11-02): add a player, mark arrival and seat them in the new-game sheet.
describe('new-game sheet marks arrival and seats in one place', () => {
  it('lists registered players whose arrival is not marked', () => {
    expect(source).toContain('data-testid="awaiting-arrival"');
    expect(source).toContain('awaitingList.map(');
  });
  it('marks the arrival through the participant update and seats the player', () => {
    const start = source.indexOf('const arriveAndSeat = async');
    const body = source.slice(start, source.indexOf('};', start));
    expect(body).toContain("api.updateParticipant(participant.id, { attendance_status: 'attended' })");
    expect(body).toContain('selectNewParticipant(updated)');
  });
  it('no longer sends the organizer to the «Вечер» tab to mark arrivals', () => {
    expect(source).not.toContain('на вкладке «Вечер»');
  });
});
