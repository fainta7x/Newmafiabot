import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadPlayerEloHistory } from '../server/services/playerEloHistoryService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

// 2026-10-06: the Elo replay froze the server every minute; it is now kept until its inputs change.
describe('Elo history is replayed only when its inputs change', () => {
  it('returns the kept timeline for repeated reads and replays after a rated change', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await createApp(db);
    const first = await loadPlayerEloHistory(db);
    expect(await loadPlayerEloHistory(db)).toBe(first);
    const now = new Date().toISOString();
    await db.run("INSERT INTO players (id, nickname, elo, created_at, updated_at) VALUES ('p1', 'Игрок', 1000, ?, ?)", [now, now]);
    const afterPlayer = await loadPlayerEloHistory(db);
    expect(afterPlayer).not.toBe(first);
    expect(await loadPlayerEloHistory(db)).toBe(afterPlayer);
    await db.run("UPDATE players SET elo = 1012 WHERE id = 'p1'"); // what every rated save does (canonical rebuild)
    expect(await loadPlayerEloHistory(db)).not.toBe(afterPlayer);
  });
});
