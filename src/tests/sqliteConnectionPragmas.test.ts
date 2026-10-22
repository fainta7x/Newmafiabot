import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';

describe('SQLite connection settings', () => {
  it('uses WAL with synchronous=NORMAL and a 32 MB page cache', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pragmas-'));
    const db = createDatabaseConnection(path.join(dir, 'pragmas.sqlite'));
    try {
      expect(db.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
      // 1 = NORMAL (owner, 2026-10-22).
      expect(db.sqlite.pragma('synchronous', { simple: true })).toBe(1);
      expect(db.sqlite.pragma('cache_size', { simple: true })).toBe(-32000);
    } finally {
      db.sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
