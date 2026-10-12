import { describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import { refreshVerifiedGoMafiaProfiles } from '../server/services/goMafiaFederationSync.ts';
import { createGoMafiaPublicSnapshot, parseGoMafiaPlayerReference, type GoMafiaPlayerReference } from '../lib/gomafiaExternalProfile.ts';

function fakeDb(rows: Array<{ external_player_id: string; profile_url: string }>) {
  const run = vi.fn(async (_sql: string, _params: unknown[]) => ({ changes: 1, lastID: null }));
  const exec = vi.fn(async (_sql: string) => {});
  const all = vi.fn(async (_sql: string, _params: unknown[]) => rows);
  const get = vi.fn(async () => null);
  return { db: { run, exec, all, get } as unknown as DatabaseWrapper, run, exec, all };
}

describe('bounded federation background synchronization', () => {
  it('refreshes a confirmed identity without writing to local game or Elo tables', async () => {
    const { db, run, all } = fakeDb([{ external_player_id: '1202', profile_url: 'https://gomafia.pro/stats/1202' }]);
    const fetchSnapshot = vi.fn(async (ref: GoMafiaPlayerReference) => createGoMafiaPublicSnapshot(
      ref, { year: 2026, gameFilter: 'Все игры', tournamentFilter: 'Турниры ФСМ',
        totalGames: 30, overallElo: 1685.02 }, '2026-10-12T10:00:00Z',
    ));
    const result = await refreshVerifiedGoMafiaProfiles(db, {
      now: new Date('2026-10-12T12:00:00Z'), fetchSnapshot,
    });
    expect(result).toEqual({ attempted: 1, updated: 1, failed: 0 });
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(all.mock.calls[0][1][1]).toBe('verified');
    expect(all.mock.calls[0][1][0]).toBe('career-v1');
    expect(run.mock.calls.map(args => args[0])).toEqual([
      expect.stringContaining('gomafia_refresh_attempts'),
      expect.stringContaining('gomafia_player_snapshots'),
    ]);
  });
  it('rejects a mismatched external identity before making any network calls', async () => {
    const { db, run } = fakeDb([{ external_player_id: '42', profile_url: 'https://gomafia.pro/stats/1202' }]);
    const fetchSnapshot = vi.fn(async () => createGoMafiaPublicSnapshot(
      parseGoMafiaPlayerReference('1202')!, { year: 2026 }, '2026-10-12T10:00:00Z',
    ));
    const result = await refreshVerifiedGoMafiaProfiles(db, { fetchSnapshot });
    expect(result).toEqual({ attempted: 1, updated: 0, failed: 1 });
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it('records failures without retry loops and limits request batches', async () => {
    const { db, run, all } = fakeDb([{ external_player_id: '1202', profile_url: 'https://gomafia.pro/stats/1202' }]);
    const result = await refreshVerifiedGoMafiaProfiles(db, {
      limit: 999, fetchSnapshot: async () => { throw Error('provider unavailable'); },
    });
    expect(result).toEqual({ attempted: 1, updated: 0, failed: 1 });
    expect(all.mock.calls[0][1][4]).toBe(4);
    expect(run.mock.calls[1][0]).toContain('last_error');
  });
});
