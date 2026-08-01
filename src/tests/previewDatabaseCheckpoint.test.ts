import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { createDatabaseConnection, resetDbInstanceForTesting } from '../db/index';
import { createPreviewCheckpoint } from '../db/previewDatabaseCheckpoint';

describe('Preview Database Checkpoint', () => {
  const cwd = process.cwd();
  const dbPath = path.join(cwd, 'mafia_crm.runtime.sqlite');
  const checkpointPath = path.join(cwd, 'mafia_crm.checkpoint.sqlite');
  const prodPath = path.join(cwd, 'mafia_crm.sqlite');
  
  beforeEach(() => {
    resetDbInstanceForTesting();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
    if (fs.existsSync(prodPath)) fs.unlinkSync(prodPath);
    delete process.env.DATABASE_PATH;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    resetDbInstanceForTesting();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
    if (fs.existsSync(prodPath)) fs.unlinkSync(prodPath);
  });

  it('создаётся валидный checkpoint', async () => {
    const db = createDatabaseConnection();
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY); INSERT INTO test DEFAULT VALUES;');
    
    const result = await createPreviewCheckpoint(db);
    expect(result.success).toBe(true);
    expect(fs.existsSync(checkpointPath)).toBe(true);

    const checkDb = new Database(checkpointPath, { readonly: true });
    const integrity = checkDb.pragma('integrity_check', { simple: false }) as any[];
    expect(integrity[0].integrity_check).toBe('ok');
    
    const rows = checkDb.prepare('SELECT * FROM test').all();
    expect(rows.length).toBe(1);
    checkDb.close();
  });

  it('production и явный DATABASE_PATH не затрагиваются', async () => {
    process.env.NODE_ENV = 'production';
    const db = createDatabaseConnection();
    const result = await createPreviewCheckpoint(db);
    expect(result.success).toBe(false);
    expect(result.message).toContain('disabled in production');
    expect(fs.existsSync(checkpointPath)).toBe(false);

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_PATH = 'custom.sqlite';
    const db2 = createDatabaseConnection();
    const result2 = await createPreviewCheckpoint(db2);
    expect(result2.success).toBe(false);
    expect(result2.message).toContain('explicit DATABASE_PATH');
    if (fs.existsSync('custom.sqlite')) fs.unlinkSync('custom.sqlite');
  });

  it('повреждённый checkpoint не используется для восстановления runtime', async () => {
    // Create a corrupted checkpoint
    fs.writeFileSync(checkpointPath, 'not a sqlite database but some random data');
    
    // Connection should throw or create empty runtime instead of copying corrupted?
    // Wait, createDatabaseConnection throws an error if it's corrupted. Let's test that it throws.
    expect(() => createDatabaseConnection()).toThrow(/Checkpoint is corrupted/);
    expect(fs.existsSync(dbPath)).toBe(false);
  });

  it('существующая runtime-база не перезаписывается', async () => {
    // 1. Create a runtime DB
    const initialDb = createDatabaseConnection();
    await initialDb.exec('CREATE TABLE test_runtime (id INTEGER PRIMARY KEY);');
    initialDb.sqlite.close();
    
    // 2. Create a checkpoint that is DIFFERENT
    const cpDb = new Database(checkpointPath);
    cpDb.exec('CREATE TABLE test_checkpoint (id INTEGER PRIMARY KEY);');
    cpDb.close();
    
    // 3. Open DB again, it should NOT copy checkpoint over existing runtime
    const nextDb = createDatabaseConnection();
    const tables = nextDb.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('test_runtime');
    expect(tableNames).not.toContain('test_checkpoint');
  });
  
  it('параллельные checkpoint-запросы выполняются последовательно', async () => {
    const db = createDatabaseConnection();
    
    const p1 = createPreviewCheckpoint(db);
    const p2 = createPreviewCheckpoint(db);
    
    const [res1, res2] = await Promise.all([p1, p2]);
    
    // One should succeed, one should fail due to in-progress lock
    expect(res1.success || res2.success).toBe(true);
    expect(res1.success && res2.success).toBe(false);
  });
});
