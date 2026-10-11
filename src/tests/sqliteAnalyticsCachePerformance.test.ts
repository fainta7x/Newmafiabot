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
    expect(await db.get('SELECT id FROM players WHERE id = ?', ['temporary-player'])).toBeNull();
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
  it('keeps the parsed games while poker, the wallet and notifications write, and drops them when a game or a name changes', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const now = new Date().toISOString();
    await db.run('INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES (?,?,?,?,?)', ['p1', 'Один', 100, now, now]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('ev','Вечер',?,'Europe/Moscow','rating_evening','completed',20,100,?,?)`, [now, now, now]);
    const allSpy = vi.spyOn(db, 'all');
    const scans = () => allSpy.mock.calls.filter(([sql]) => /FROM games g/i.test(String(sql))).length;
    await loadCompletedGameSnapshots(db);
    expect(scans()).toBe(1);

    // What a poker session does all the time: table saves, token changes, the player's own row, a chat message.
    await db.exec('CREATE TABLE IF NOT EXISTS poker_runtime_state (id TEXT PRIMARY KEY, state_json TEXT, updated_at TEXT)');
    for (let i = 0; i < 5; i++) {
      await db.run("INSERT OR REPLACE INTO poker_runtime_state (id,state_json,updated_at) VALUES ('main',?,?)", [`{"n":${i}}`, now]);
      await db.run('UPDATE players SET tokens = tokens + 1, updated_at = ? WHERE id = ?', [now, 'p1']);
      await loadCompletedGameSnapshots(db);
    }
    expect(scans()).toBe(1);

    // A real change of the inputs drops the cache: a name, a finished game, a corrected protocol, a removed game.
    await db.run('UPDATE players SET nickname = ? WHERE id = ?', ['Один (новый)', 'p1']);
    await loadCompletedGameSnapshots(db);
    expect(scans()).toBe(2);
    const inserted = await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,protocol_text,slots_json,created_at)
      VALUES ('ev',1,?,'red','','Судья','{}','[]',?)`, [now, now]);
    await loadCompletedGameSnapshots(db);
    expect(scans()).toBe(3);
    await db.run('UPDATE games SET protocol_text = ? WHERE id = ?', ['{"kind":"club_evening_protocol"}', inserted.lastID]);
    await loadCompletedGameSnapshots(db);
    expect(scans()).toBe(4);
    await db.run('DELETE FROM games WHERE id = ?', [inserted.lastID]);
    await loadCompletedGameSnapshots(db);
    expect(scans()).toBe(5);
    await loadCompletedGameSnapshots(db);
    expect(scans()).toBe(5);
  });

  it('does not drop the cache for the autosave of a tournament draft, but does for a finished game', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO tournaments (id,title,date,stage,status,created_at,updated_at) VALUES ('t','Турнир',?,'qualifying','active',?,?)`, [now, now, now]);
    await db.run(`INSERT INTO tournament_games (id,tournament_id,game_number,status) VALUES ('tg','t',1,'in_progress')`);
    const allSpy = vi.spyOn(db, 'all');
    const scans = () => allSpy.mock.calls.filter(([sql]) => /FROM tournament_game_seats/i.test(String(sql))).length;
    await loadCompletedGameSnapshots(db);
    expect(scans()).toBe(1);
    await db.run("UPDATE tournament_games SET draft_protocol_json = ? WHERE id = 'tg'", ['{"events":[1,2,3]}']);
    await loadCompletedGameSnapshots(db);
    expect(scans()).toBe(1);
    await db.run("UPDATE tournament_games SET status = 'completed', winner_team = 'red', completed_at = ? WHERE id = 'tg'", [now]);
    await loadCompletedGameSnapshots(db);
    expect(scans()).toBe(2);
  });
});
