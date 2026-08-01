import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { createDatabaseConnection, resetDbInstanceForTesting } from '../db/index';
import { createPreviewCheckpoint } from '../db/previewDatabaseCheckpoint';

describe.sequential('Preview Database Checkpoint', () => {
  const projectRoot = process.cwd();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabasePath = process.env.DATABASE_PATH;
  let temporaryRoot: string;

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mafia-checkpoint-test-'));
    expect(path.resolve(temporaryRoot)).not.toBe(path.resolve(projectRoot));
    fs.cpSync(path.join(projectRoot, 'drizzle'), path.join(temporaryRoot, 'drizzle'), {
      recursive: true,
    });
    resetDbInstanceForTesting();
    delete process.env.DATABASE_PATH;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    resetDbInstanceForTesting();
    process.chdir(projectRoot);

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;

    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('creates a valid checkpoint outside the repository', async () => {
    const projectRuntimePath = path.join(projectRoot, 'mafia_crm.runtime.sqlite');
    const projectRuntimeExistedBefore = fs.existsSync(projectRuntimePath);
    const runtimePath = path.join(temporaryRoot, 'mafia_crm.runtime.sqlite');
    const checkpointPath = path.join(temporaryRoot, 'mafia_crm.checkpoint.sqlite');
    const db = createDatabaseConnection(runtimePath);
    await db.exec('CREATE TABLE checkpoint_probe (id INTEGER PRIMARY KEY); INSERT INTO checkpoint_probe DEFAULT VALUES;');

    const result = await createPreviewCheckpoint(db, { baseDir: temporaryRoot });
    expect(result.success).toBe(true);
    expect(result.checkpointPath).toBe(checkpointPath);
    expect(fs.existsSync(checkpointPath)).toBe(true);
    expect(fs.existsSync(projectRuntimePath)).toBe(projectRuntimeExistedBefore);

    const checkpointDb = new Database(checkpointPath, { readonly: true });
    try {
      const integrity = checkpointDb.pragma('integrity_check', { simple: false }) as Array<{
        integrity_check: string;
      }>;
      expect(integrity[0]?.integrity_check).toBe('ok');
      expect(checkpointDb.prepare('SELECT count(*) AS count FROM checkpoint_probe').get()).toEqual({ count: 1 });
    } finally {
      checkpointDb.close();
      db.sqlite.close();
    }
  });

  it('does not run in production, implicit test mode, or with explicit DATABASE_PATH', async () => {
    const productionDb = createDatabaseConnection(path.join(temporaryRoot, 'production.sqlite'));
    process.env.NODE_ENV = 'production';
    const productionResult = await createPreviewCheckpoint(productionDb, { baseDir: temporaryRoot });
    expect(productionResult.success).toBe(false);
    productionDb.sqlite.close();

    process.env.NODE_ENV = 'test';
    const testDb = createDatabaseConnection(path.join(temporaryRoot, 'test.sqlite'));
    const testResult = await createPreviewCheckpoint(testDb);
    expect(testResult.success).toBe(false);
    testDb.sqlite.close();

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_PATH = path.join(temporaryRoot, 'custom.sqlite');
    const explicitDb = createDatabaseConnection(process.env.DATABASE_PATH);
    const explicitResult = await createPreviewCheckpoint(explicitDb, { baseDir: temporaryRoot });
    expect(explicitResult.success).toBe(false);
    explicitDb.sqlite.close();

    expect(fs.existsSync(path.join(temporaryRoot, 'mafia_crm.checkpoint.sqlite'))).toBe(false);
  });

  it('refuses to restore a corrupted checkpoint', () => {
    process.chdir(temporaryRoot);
    const checkpointPath = path.join(temporaryRoot, 'mafia_crm.checkpoint.sqlite');
    const runtimePath = path.join(temporaryRoot, 'mafia_crm.runtime.sqlite');
    fs.writeFileSync(checkpointPath, 'not a sqlite database');

    expect(() => createDatabaseConnection()).toThrow(/Checkpoint is corrupted/);
    expect(fs.existsSync(runtimePath)).toBe(false);
  });

  it('does not overwrite an existing runtime database', () => {
    process.chdir(temporaryRoot);
    const runtimeDb = createDatabaseConnection();
    runtimeDb.sqlite.exec('CREATE TABLE runtime_marker (id INTEGER PRIMARY KEY)');
    runtimeDb.sqlite.close();

    const checkpointDb = new Database(path.join(temporaryRoot, 'mafia_crm.checkpoint.sqlite'));
    checkpointDb.exec('CREATE TABLE checkpoint_marker (id INTEGER PRIMARY KEY)');
    checkpointDb.close();

    const reopenedRuntimeDb = createDatabaseConnection();
    try {
      const tableNames = (
        reopenedRuntimeDb.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
          name: string;
        }>
      ).map((table) => table.name);
      expect(tableNames).toContain('runtime_marker');
      expect(tableNames).not.toContain('checkpoint_marker');
    } finally {
      reopenedRuntimeDb.sqlite.close();
    }
  });

  it('serializes concurrent checkpoint requests instead of sharing or rejecting one', async () => {
    const runtimePath = path.join(temporaryRoot, 'mafia_crm.runtime.sqlite');
    const db = createDatabaseConnection(runtimePath);
    await db.exec('CREATE TABLE queue_probe (id INTEGER PRIMARY KEY);');

    const originalBackup = db.sqlite.backup.bind(db.sqlite);
    let activeBackups = 0;
    let maximumConcurrentBackups = 0;
    let backupCalls = 0;
    (db.sqlite as any).backup = async (...args: Parameters<typeof db.sqlite.backup>) => {
      backupCalls += 1;
      activeBackups += 1;
      maximumConcurrentBackups = Math.max(maximumConcurrentBackups, activeBackups);
      await new Promise((resolve) => setTimeout(resolve, 10));
      try {
        return await originalBackup(...args);
      } finally {
        activeBackups -= 1;
      }
    };

    const [firstResult, secondResult] = await Promise.all([
      createPreviewCheckpoint(db, { baseDir: temporaryRoot }),
      createPreviewCheckpoint(db, { baseDir: temporaryRoot }),
    ]);

    expect(firstResult.success).toBe(true);
    expect(secondResult.success).toBe(true);
    expect(backupCalls).toBe(2);
    expect(maximumConcurrentBackups).toBe(1);
    db.sqlite.close();
  });
});
