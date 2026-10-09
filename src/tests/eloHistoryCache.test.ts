import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadPlayerEloHistory } from '../server/services/playerEloHistoryService.ts';
import { rebuildCanonicalEloRatings } from '../server/services/eloRatingService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

// 2026-10-06: the Elo replay froze the server every minute; it is now kept until its inputs change.
describe('Elo history is replayed only when its inputs change', () => {
  it('returns the kept timeline for repeated reads and replays after a rated change', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await createApp(db);
    const first = await loadPlayerEloHistory(db);
    expect(await loadPlayerEloHistory(db)).toBe(first);
    // Repeated reads must not even execute the old full-table fingerprint.
    const getSpy = vi.spyOn(db, 'get');
    expect(await loadPlayerEloHistory(db)).toBe(first);
    expect(getSpy.mock.calls).toHaveLength(0);
    getSpy.mockRestore();

    const now = new Date().toISOString();
    await db.run("INSERT INTO players (id, nickname, elo, created_at, updated_at) VALUES ('p1', 'Игрок', 1000, ?, ?)", [now, now]);
    const afterPlayer = await loadPlayerEloHistory(db);
    expect(afterPlayer).not.toBe(first);
    expect(await loadPlayerEloHistory(db)).toBe(afterPlayer);
    // Unrelated writes must not force a full canonical Elo replay.
    db.sqlite.exec('CREATE TABLE perf_unrelated (id INTEGER PRIMARY KEY, value TEXT)');
    await db.run('INSERT INTO perf_unrelated (value) VALUES (?)', ['Not an Elo event']);
    expect(await loadPlayerEloHistory(db)).toBe(afterPlayer);
    await db.run("UPDATE players SET elo = 1012 WHERE id = 'p1'"); // what every rated save does (canonical rebuild)
    const afterElo = await loadPlayerEloHistory(db);
    expect(afterElo).not.toBe(afterPlayer);
    // A rebuild (a corrected participant keeps every count and sum) also makes it stale.
    await rebuildCanonicalEloRatings(db);
    expect(await loadPlayerEloHistory(db)).not.toBe(afterElo);
  });
});
