import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getSqliteBackupStatus } from '../server/services/sqliteBackupStatusService.ts';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('SQLite backup freshness status', () => {
  it('reports the newest verified-looking backup as healthy', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-status-'));
    dirs.push(dir);
    const file = path.join(dir, 'mafia_crm-2026-09-20T10-00-00.sqlite');
    await fs.writeFile(file, 'sqlite-backup');
    const now = new Date('2026-09-20T12:00:00.000Z');
    await fs.utimes(file, new Date('2026-09-20T10:30:00.000Z'), new Date('2026-09-20T10:30:00.000Z'));

    const status = await getSqliteBackupStatus({
      directory: dir,
      now,
      uptimeSeconds: 60 * 60,
      staleAfterHours: 12,
    });

    expect(status).toMatchObject({
      ok: true,
      state: 'ok',
      latest_file: path.basename(file),
      age_minutes: 90,
    });
    expect(Number(status.bytes)).toBeGreaterThan(0);
  });

  it('reports a stale backup after the configured safety window', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-status-'));
    dirs.push(dir);
    const file = path.join(dir, 'mafia_crm-old.sqlite');
    await fs.writeFile(file, 'sqlite-backup');
    await fs.utimes(file, new Date('2026-09-19T20:00:00.000Z'), new Date('2026-09-19T20:00:00.000Z'));

    const status = await getSqliteBackupStatus({
      directory: dir,
      now: new Date('2026-09-20T12:30:00.000Z'),
      uptimeSeconds: 24 * 60 * 60,
      staleAfterHours: 12,
    });

    expect(status).toMatchObject({ ok: false, state: 'stale', error: 'Latest backup is stale' });
  });

  it('allows a short warm-up window before the first backup exists', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-status-'));
    dirs.push(dir);
    const status = await getSqliteBackupStatus({
      directory: dir,
      uptimeSeconds: 2 * 60,
      staleAfterHours: 12,
    });
    expect(status).toMatchObject({ ok: true, state: 'warming_up' });
  });
});
