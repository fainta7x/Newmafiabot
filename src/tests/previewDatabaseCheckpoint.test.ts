import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { createPreviewCheckpoint } from '../db/previewDatabaseCheckpoint.ts';
import { getPreviewRecoveryDir, verifySqliteFile, restoreGzB64FileAtomically } from '../db/previewRecovery.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';

describe('Preview Database Checkpoint & Recovery', () => {
  let tempDir: string;
  let dbPath: string;
  let sqliteDb: Database.Database;
  let wrapper: DatabaseWrapper;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDbPath = process.env.DATABASE_PATH;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-preview-checkpoint-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    sqliteDb = new Database(dbPath);
    sqliteDb.exec("CREATE TABLE test (id INT, val TEXT); INSERT INTO test VALUES (1, 'initial_val');");

    wrapper = {
      sqlite: sqliteDb,
      dbPath: dbPath,
    } as unknown as DatabaseWrapper;

    delete process.env.DATABASE_PATH;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    try {
      sqliteDb.close();
    } catch (_) {}

    process.env.NODE_ENV = originalNodeEnv;
    if (originalDbPath !== undefined) {
      process.env.DATABASE_PATH = originalDbPath;
    } else {
      delete process.env.DATABASE_PATH;
    }

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    const recoveryDir = getPreviewRecoveryDir(dbPath);
    if (fs.existsSync(recoveryDir)) {
      fs.rmSync(recoveryDir, { recursive: true, force: true });
    }
  });

  it('1. creates valid checkpoint (latest.sqlite & latest.sqlite.gz.b64) in recovery dir', async () => {
    const res = await createPreviewCheckpoint(wrapper);
    expect(res.success).toBe(true);
    expect(res.message).toContain('Checkpoint created successfully');

    const recoveryDir = getPreviewRecoveryDir(dbPath);
    const finalFile = path.join(recoveryDir, 'latest.sqlite');
    const gzB64File = path.join(recoveryDir, 'latest.sqlite.gz.b64');

    expect(fs.existsSync(finalFile)).toBe(true);
    expect(fs.existsSync(gzB64File)).toBe(true);
    expect(verifySqliteFile(finalFile)).toBe(true);
  });

  it('2. skips production or explicitly configured databases without reporting an error', async () => {
    process.env.NODE_ENV = 'production';
    const res1 = await createPreviewCheckpoint(wrapper);
    expect(res1.success).toBe(true);
    expect(res1.skipped).toBe(true);
    expect(res1.message).toContain('skipped');

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_PATH = '/custom/path.sqlite';
    const res2 = await createPreviewCheckpoint(wrapper);
    expect(res2.success).toBe(true);
    expect(res2.skipped).toBe(true);
    expect(res2.message).toContain('skipped');
  });

  it('3. corrupted bootstrap is not used for restoring runtime', () => {
    const corruptGzPath = path.join(tempDir, 'corrupt_bootstrap.gz.b64');
    fs.writeFileSync(corruptGzPath, 'CORRUPTED_BASE64_GZIP_CONTENT_99999', 'utf-8');

    const targetPath = path.join(tempDir, 'target_restored.sqlite');

    const restored = restoreGzB64FileAtomically(corruptGzPath, targetPath);
    expect(restored).toBe(false);
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(verifySqliteFile(targetPath)).toBe(false);
  });

  it('4. runtime is restored only from checkpoint of its own project', async () => {
    await createPreviewCheckpoint(wrapper);

    const dbPath2 = path.join(tempDir, 'another_project.sqlite');
    const recoveryDir2 = getPreviewRecoveryDir(dbPath2);

    expect(fs.existsSync(recoveryDir2)).toBe(false);
    expect(fs.existsSync(path.join(recoveryDir2, 'latest.sqlite'))).toBe(false);
  });

  it('5. different runtime database paths use different recovery directories', () => {
    const dir1 = getPreviewRecoveryDir(path.join(tempDir, 'project1.sqlite'));
    const dir2 = getPreviewRecoveryDir(path.join(tempDir, 'project2.sqlite'));

    expect(dir1).not.toBe(dir2);
  });

  it('6. existing runtime database is not overwritten', () => {
    expect(fs.existsSync(dbPath)).toBe(true);

    const connection = createDatabaseConnection(dbPath);
    const row = connection.sqlite.prepare('SELECT val FROM test WHERE id = 1').get() as { val: string };

    expect(row.val).toBe('initial_val');
    connection.sqlite.close();
  });

  it('7. parallel checkpoint requests execute sequentially and succeed', async () => {
    const p1 = createPreviewCheckpoint(wrapper);
    const p2 = createPreviewCheckpoint(wrapper);
    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
  });
});
