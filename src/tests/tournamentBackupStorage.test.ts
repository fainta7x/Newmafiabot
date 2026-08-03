import { describe, expect, it } from 'vitest';
import { getBackupFreshness, shouldReplaceLocalBackup } from '../lib/tournamentBackupStorage.ts';

function backup(completed: number, results: number, updatedAt: string, checksum: string) {
  return {
    metadata: {
      completed_protocols_count: completed,
      player_results_count: results,
      data_updated_at: updatedAt,
    },
    checksum,
  };
}

describe('local tournament backup monotonicity', () => {
  it('никогда не заменяет 10/10 откатившейся серверной копией 6/10', () => {
    const safe = backup(10, 100, '2026-08-01T20:00:00.000Z', 'safe');
    const rolledBack = backup(6, 60, '2026-08-01T21:00:00.000Z', 'rollback');

    expect(shouldReplaceLocalBackup(safe, rolledBack)).toBe(false);
  });

  it('при равном прогрессе принимает только более свежие данные', () => {
    const current = backup(6, 60, '2026-08-01T20:00:00.000Z', 'current');
    const newer = backup(6, 60, '2026-08-01T20:01:00.000Z', 'newer');
    const older = backup(6, 60, '2026-08-01T19:59:00.000Z', 'older');

    expect(shouldReplaceLocalBackup(current, newer)).toBe(true);
    expect(shouldReplaceLocalBackup(current, older)).toBe(false);
  });

  it('одинаковую логическую версию можно безопасно записать повторно', () => {
    const same = backup(6, 60, '2026-08-01T20:00:00.000Z', 'same');
    expect(shouldReplaceLocalBackup(same, { ...same })).toBe(true);
    expect(getBackupFreshness(same).results).toBe(60);
  });
});
