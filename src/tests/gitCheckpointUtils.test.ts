import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import {
  verifyDatabaseIntegrityAndStats,
  compressAndSaveGitCheckpoint,
  restoreGitCheckpointToSqlite,
} from '../db/gitCheckpointUtils.ts';
import { getDb } from '../db/index.ts';

describe('gitCheckpointUtils', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git_checkpoint_test_'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should compress to base64 gzip and restore back losslessly', () => {
    const originalSqlitePath = path.join(tmpDir, 'test.sqlite');
    const b64Path = path.join(tmpDir, 'checkpoint.gz.b64');
    const restoredSqlitePath = path.join(tmpDir, 'restored.sqlite');

    // Create a dummy SQLite db
    const db = new Database(originalSqlitePath);
    db.exec("CREATE TABLE test (id INT, val TEXT); INSERT INTO test VALUES (1, 'hello');");
    db.close();

    const originalSize = fs.statSync(originalSqlitePath).size;
    expect(originalSize).toBeGreaterThan(0);

    // Compress
    compressAndSaveGitCheckpoint(originalSqlitePath, b64Path);
    expect(fs.existsSync(b64Path)).toBe(true);

    // Restore
    restoreGitCheckpointToSqlite(b64Path, restoredSqlitePath);
    expect(fs.existsSync(restoredSqlitePath)).toBe(true);

    const restoredDb = new Database(restoredSqlitePath, { readonly: true });
    const row = restoredDb.prepare('SELECT * FROM test WHERE id = 1').get() as any;
    restoredDb.close();

    expect(row).toBeDefined();
    expect(row.val).toBe('hello');
  });

  it('should verify runtime database integrity and games #7 and #8', async () => {
    const runtimeDb = await getDb();
    const backupSqlitePath = path.join(tmpDir, 'runtime_backup.sqlite');

    await runtimeDb.sqlite.backup(backupSqlitePath);

    const stats = verifyDatabaseIntegrityAndStats(backupSqlitePath);

    expect(stats.totalTournaments).toBeGreaterThanOrEqual(1);
    expect(stats.bogdanaStats.title).toBe('Турнир Богдана 1.08');
    expect(stats.bogdanaStats.game7.status).toBe('completed');
    expect(stats.bogdanaStats.game7.resultsCount).toBe(10);
    expect(stats.bogdanaStats.game8.status).toBe('completed');
    expect(stats.bogdanaStats.game8.resultsCount).toBe(10);
  });

  it('should throw when checking a missing or corrupted database', () => {
    const nonExistentPath = path.join(tmpDir, 'does_not_exist.sqlite');
    expect(() => verifyDatabaseIntegrityAndStats(nonExistentPath)).toThrow();

    const emptyPath = path.join(tmpDir, 'empty.sqlite');
    fs.writeFileSync(emptyPath, '');
    expect(() => verifyDatabaseIntegrityAndStats(emptyPath)).toThrow();
  });
});
