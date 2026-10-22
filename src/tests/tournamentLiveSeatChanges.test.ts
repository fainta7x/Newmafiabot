import { describe, expect, it } from 'vitest';
import { changedRoles, changedSeats } from '../components/player/TournamentLiveGameModal.tsx';

const row = (seat: number, participant: string) => ({ seat_number: seat, participant_id: participant }) as any;

describe('seats changed in the CRM while a tournament game runs', () => {
  it('names the seats whose player is different now', () => {
    const before = [row(1, 'a'), row(2, 'b'), row(3, 'c')];
    expect(changedSeats(before, [row(1, 'a'), row(2, 'c'), row(3, 'b')])).toEqual([2, 3]);
    expect(changedSeats(before, before)).toEqual([]);
  });

  it('names the seats whose role was fixed in the CRM', () => {
    const before = [{ ...row(1, 'a'), role: 'civilian' }, { ...row(2, 'b'), role: 'mafia' }];
    expect(changedRoles(before, [{ ...row(1, 'a'), role: 'mafia' }, { ...row(2, 'b'), role: 'civilian' }])).toEqual([1, 2]);
    expect(changedRoles(before, before)).toEqual([]);
  });
});
