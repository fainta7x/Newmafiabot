import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { createDatabaseConnection, resetDbInstanceForTesting } from '../db/index';
import { createPreviewCheckpoint } from '../db/previewDatabaseCheckpoint';

describe('Preview Database Checkpoint', () => {
  let tmpDir: string;
  let originalCwd: string;
  let dbPath: string;
  let checkpointPath: string;
  let originalEnv: any;
  
  beforeEach(() => {
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mafia-test-'));
    process.chdir(tmpDir); // change cwd to temp dir so database is created here

    dbPath = path.join(tmpDir, 'mafia_crm.runtime.sqlite');
    checkpointPath = path.join(os.tmpdir(), 'newmafia-preview-recovery', 'latest.sqlite');

    if (fs.existsSync(checkpointPath)) {
      try { fs.unlinkSync(checkpointPath); } catch (_) {}
    }

    resetDbInstanceForTesting();
    delete process.env.DATABASE_PATH;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    resetDbInstanceForTesting();
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('создаётся валидный checkpoint вне проекта', async () => {
    const db = await createDatabaseConnection();
    await db.exec('CREATE TABLE IF NOT EXISTS test_chk (id INTEGER PRIMARY KEY); INSERT INTO test_chk DEFAULT VALUES;');
    
    const result = await createPreviewCheckpoint(db);
    expect(result.success).toBe(true);
    expect(fs.existsSync(checkpointPath)).toBe(true);

    const checkDb = new Database(checkpointPath, { readonly: true });
    const integrity = checkDb.pragma('integrity_check', { simple: false }) as any[];
    expect(integrity[0].integrity_check).toBe('ok');
    
    const rows = checkDb.prepare('SELECT * FROM test_chk').all();
    expect(rows.length).toBe(1);
    checkDb.close();
  });

  it('production и явный DATABASE_PATH не затрагиваются', async () => {
    process.env.NODE_ENV = 'production';
    const db = await createDatabaseConnection();
    const result = await createPreviewCheckpoint(db);
    expect(result.success).toBe(false);
    expect(result.message).toContain('disabled in production');
    expect(fs.existsSync(checkpointPath)).toBe(false);

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_PATH = 'custom.sqlite';
    const db2 = await createDatabaseConnection();
    const result2 = await createPreviewCheckpoint(db2);
    expect(result2.success).toBe(false);
    expect(result2.message).toContain('explicit DATABASE_PATH');
  });

  it('повреждённый bootstrap не используется для восстановления runtime', async () => {
    resetDbInstanceForTesting();
    fs.writeFileSync(path.join(tmpDir, 'mafia_crm.checkpoint.sqlite.gz.b64'), Buffer.from('corrupted data').toString('base64'));
    await expect(Promise.resolve().then(() => createDatabaseConnection())).rejects.toThrow(/Bootstrap checkpoint/);
    expect(fs.existsSync(dbPath)).toBe(false);
  });

  it('существующая runtime-база не перезаписывается', async () => {
    const initialDb = await createDatabaseConnection();
    await initialDb.exec('CREATE TABLE IF NOT EXISTS test_runtime (id INTEGER PRIMARY KEY);');
    initialDb.sqlite.close();
    
    fs.writeFileSync(path.join(tmpDir, 'mafia_crm.checkpoint.sqlite.gz.b64'), Buffer.from('some other data').toString('base64'));
    
    const nextDb = await createDatabaseConnection();
    const tables = nextDb.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('test_runtime');
  });
  
  it('параллельные checkpoint-запросы выполняются последовательно и успешно', async () => {
    const db = await createDatabaseConnection();
    await db.exec('CREATE TABLE IF NOT EXISTS test_par (id INTEGER PRIMARY KEY);');
    
    const p1 = createPreviewCheckpoint(db);
    const p2 = createPreviewCheckpoint(db);
    
    const [res1, res2] = await Promise.all([p1, p2]);
    
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
  });
});
