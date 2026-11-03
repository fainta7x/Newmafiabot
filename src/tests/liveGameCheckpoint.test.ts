// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { clearLiveGameCheckpoint, loadLiveGameCheckpoint, normalizeCheckpoint, saveLiveGameCheckpoint } from '../server/services/liveGameCheckpointService.ts';
import { readClubLiveCheckpoint, writeClubLiveCheckpoint } from '../components/crm/useClubLiveCheckpoint.ts';
import { clubLiveEvidenceKey, clubLiveSessionKey } from '../lib/liveClubSession.ts';

// «Продолжить игру» (owner, 2026-11-03; AR04 step 2).
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); localStorage.clear(); });
const session = (extra: Record<string, unknown> = {}) => JSON.stringify({ phase: 'day_speeches', roundNumber: 2, activePlayers: [{ slot_num: 1 }], ...extra });

const seed = async (status: 'draft' | 'completed' = 'draft') => {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  await db.run(`INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
    VALUES (7,NULL,1,'2026-11-03','red','',?,'[]','2026-11-03T10:00:00Z')`, [JSON.stringify({ kind: 'club', protocol: { status } })]);
  return db;
};

describe('server copy of a live game', () => {
  it('keeps the latest copy of a running game and gives it back', async () => {
    const db = await seed();
    expect(await saveLiveGameCheckpoint(db, 7, { session: session(), evidence: '{"votes":[]}' })).toBe('saved');
    expect(await saveLiveGameCheckpoint(db, 7, { session: session({ roundNumber: 3 }) })).toBe('saved');
    const copy = await loadLiveGameCheckpoint(db, 7);
    expect(JSON.parse(copy!.session).roundNumber).toBe(3);
    expect(copy!.saved_at).toBeTruthy();
  });

  it('has no copy for a finished or missing game, and a cleared copy is gone', async () => {
    const done = await seed('completed');
    expect(await saveLiveGameCheckpoint(done, 7, { session: session() })).toBe('finished');
    expect(await loadLiveGameCheckpoint(done, 7)).toBeNull();
    expect(await saveLiveGameCheckpoint(done, 99, { session: session() })).toBe('missing');
    const db = await seed();
    await saveLiveGameCheckpoint(db, 7, { session: session() });
    await clearLiveGameCheckpoint(db, 7);
    expect(await loadLiveGameCheckpoint(db, 7)).toBeNull();
  });

  it('refuses a session that is not a started game', () => {
    expect(normalizeCheckpoint({ session: JSON.stringify({ phase: 'setup', activePlayers: [] }) })).toBeNull();
    expect(normalizeCheckpoint({ session: 'not json' })).toBeNull();
    expect(normalizeCheckpoint({})).toBeNull();
  });
});

describe('device side of «Продолжить игру»', () => {
  it('sends the device copy with the last Undo steps only', () => {
    localStorage.setItem(clubLiveSessionKey(7), session({ historyStack: Array.from({ length: 12 }, (_, i) => ({ i })) }));
    const copy = readClubLiveCheckpoint(7)!;
    expect(JSON.parse(copy.session).historyStack.map((item: any) => item.i)).toEqual([7, 8, 9, 10, 11]);
  });

  it('writes the server copy back where the engine restores its own session', () => {
    writeClubLiveCheckpoint(7, { session: session(), evidence: '{"votes":[]}' });
    expect(JSON.parse(localStorage.getItem(clubLiveSessionKey(7))!).phase).toBe('day_speeches');
    expect(localStorage.getItem(clubLiveEvidenceKey(7))).toBe('{"votes":[]}');
  });
});
