import { describe, expect, it } from 'vitest';
import { addMajorTechFoul, addMinorTechFoul, confirmAction, createInitialGameDiscipline, getPlayerPenaltyStatus, removeTechFoul } from '../lib/gameDiscipline.ts';

const initial = () => createInitialGameDiscipline([{ id: '1', team: 'red' }]);

describe('remove tech fouls in live game', () => {
  it('removes exactly one minor tech and updates the penalty', () => {
    const withFoul = addMinorTechFoul(initial(), '1');
    const result = removeTechFoul(withFoul, '1', 'minor');
    expect(result.players['1'].minorTechFouls).toBe(0);
    expect(getPlayerPenaltyStatus(result.players['1']).disciplinaryPenalty).toBe(0);
    expect(removeTechFoul(result, '1', 'minor')).toBe(result);
  });
  it('removes exactly one major tech without affecting other fouls', () => {
    const withFoul = addMajorTechFoul(initial(), '1');
    const result = removeTechFoul(withFoul, '1', 'major');
    expect(result.players['1'].majorTechFouls).toBe(0);
    expect(result.players['1'].minorTechFouls).toBe(0);
  });
  it('does not silently undo a confirmed second-tech removal', () => {
    const first = addMinorTechFoul(initial(), '1');
    const pending = addMajorTechFoul(first, '1');
    const removed = confirmAction(pending, '1');
    expect(removed.players['1'].isRemoved).toBe(true);
    expect(removeTechFoul(removed, '1', 'minor')).toBe(removed);
    expect(removeTechFoul(removed, '1', 'major')).toBe(removed);
  });
});
