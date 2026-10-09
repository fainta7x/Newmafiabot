import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadCompletedGameSnapshots } from '../server/services/clubGameAnalyticsService.ts';
import { sqliteReadVersion } from '../server/services/sqliteReadVersion.ts';

const opened: DatabaseWrapper[] = [];
const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (opened.length) opened.pop()?.sqlite.close();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('SQLite-backed player analytics cache', () => {
  it('reuses completed games between readers and invalidates on local DB writes', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const allSpy = vi.spyOn(db, 'all');
    const first = await loadCompletedGameSnapshots(db);
    expect(first).toEqual([]);
    const scanCount = () => allSpy.mock.calls.filter(([sql]) => /FROM games g/i.test(String(sql))).length;
    expect(scanCount()).toBe(1);
    const second = await loadCompletedGameSnapshots(db);
    expect(second).toEqual([]);
    expect(first).not.toBe(second); // readers can safely reorder their own array
    expect(scanCount()).toBe(1);
    const now = new Date().toISOString();
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', ['cache-player', 'Cache Player', now, now]);
    await loadCompletedGameSnapshots(db);
    expect(scanCount()).toBe(2);
  });

  it('never retains an uncommitted game snapshot after transaction rollback', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await loadCompletedGameSnapshots(db);
    db.sqlite.exec('BEGIN');
    try {
      expect(sqliteReadVersion(db)).toBeNull();
      await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)',
        ['temporary-player', 'Temporary', new Date().toISOString(), new Date().toISOString()]);
      await loadCompletedGameSnapshots(db);
    } finally {
      db.sqlite.exec('ROLLBACK');
    }
    expect(sqliteReadVersion(db)).not.toBeNull();
    expect(await db.get('SELECT id FROM players WHERE id = ?', ['temporary-player'])).toBeUndefined();
    expect(await loadCompletedGameSnapshots(db)).toEqual([]);
  });

  it('invalidates cached snapshots and fingerprints when another SQLite connection commits', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mafia-cache-')); dirs.push(dir);
    const filename = path.join(dir, 'test.sqlite');
    const db = createDatabaseConnection(filename); opened.push(db);
    const readerVersion = sqliteReadVersion(db);
    expect(readerVersion).not.toBeNull();
    const allSpy = vi.spyOn(db, 'all');
    await loadCompletedGameSnapshots(db);
    const scanCount = () => allSpy.mock.calls.filter(([sql]) => /FROM games g/i.test(String(sql))).length;
    expect(scanCount()).toBe(1);
    const other = new Database(filename);
    try {
      const now = new Date().toISOString();
      other.prepare('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)')
        .run('other-connection', 'From another connection', now, now);
    } finally { other.close(); }
    expect(sqliteReadVersion(db)).not.toBe(readerVersion);
    await loadCompletedGameSnapshots(db);
    expect(scanCount()).toBe(2);
  });
});
