import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { createPreviewCheckpoint } from '../db/previewDatabaseCheckpoint.ts';
import { getPreviewRecoveryDir, verifySqliteFile } from '../db/previewRecovery.ts';
import type { DatabaseWrapper } from '../db/index.ts';

describe('createPreviewCheckpoint', () => {
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
    sqliteDb.exec("CREATE TABLE test (id INT, val TEXT); INSERT INTO test VALUES (1, 'a');");
    
    wrapper = {
      sqlite: sqliteDb,
      dbPath: dbPath,
    } as unknown as DatabaseWrapper;

    delete process.env.DATABASE_PATH;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    sqliteDb.close();
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

  it('disabled in production or when DATABASE_PATH is explicitly set', async () => {
    process.env.NODE_ENV = 'production';
    const res1 = await createPreviewCheckpoint(wrapper);
    expect(res1.success).toBe(false);
    expect(res1.message).toContain('Checkpoint disabled');

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_PATH = '/custom/path.sqlite';
    const res2 = await createPreviewCheckpoint(wrapper);
    expect(res2.success).toBe(false);
    expect(res2.message).toContain('Checkpoint disabled');
  });

  it('creates latest.sqlite and latest.sqlite.gz.b64 in recovery dir', async () => {
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

  it('handles deduplicated parallel checkpoint requests', async () => {
    const p1 = createPreviewCheckpoint(wrapper);
    const p2 = createPreviewCheckpoint(wrapper);
    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
  });
});
