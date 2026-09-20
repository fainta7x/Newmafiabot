import fs from 'node:fs/promises';
import path from 'node:path';

export type SqliteBackupStatus = {
  ok: boolean;
  state: 'ok' | 'warming_up' | 'missing' | 'stale' | 'unavailable';
  directory: string;
  latest_file: string | null;
  latest_at: string | null;
  age_minutes: number | null;
  bytes: number | null;
  stale_after_hours: number;
  error: string | null;
};

const backupPattern = /^mafia_crm-.*\.sqlite$/;

export async function getSqliteBackupStatus(input: {
  directory?: string;
  now?: Date;
  uptimeSeconds?: number;
  staleAfterHours?: number;
} = {}): Promise<SqliteBackupStatus> {
  const directory = input.directory || process.env.SQLITE_BACKUP_DIR || '/data/backups';
  const now = input.now || new Date();
  const uptimeSeconds = input.uptimeSeconds ?? process.uptime();
  const staleAfterHours = input.staleAfterHours
    ?? Number(process.env.SQLITE_BACKUP_STALE_HOURS || 12);

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const candidates = await Promise.all(entries
      .filter((entry) => entry.isFile() && backupPattern.test(entry.name))
      .map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        const stat = await fs.stat(filePath);
        return { name: entry.name, mtimeMs: stat.mtimeMs, bytes: stat.size };
      }));
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const latest = candidates[0];

    if (!latest) {
      const warming = uptimeSeconds < 15 * 60;
      return {
        ok: warming,
        state: warming ? 'warming_up' : 'missing',
        directory,
        latest_file: null,
        latest_at: null,
        age_minutes: null,
        bytes: null,
        stale_after_hours: staleAfterHours,
        error: warming ? null : 'No product SQLite backups found',
      };
    }

    const ageMinutes = Math.max(0, Math.round((now.getTime() - latest.mtimeMs) / 60_000));
    const stale = ageMinutes > staleAfterHours * 60;
    return {
      ok: !stale && latest.bytes > 0,
      state: latest.bytes <= 0 ? 'unavailable' : stale ? 'stale' : 'ok',
      directory,
      latest_file: latest.name,
      latest_at: new Date(latest.mtimeMs).toISOString(),
      age_minutes: ageMinutes,
      bytes: latest.bytes,
      stale_after_hours: staleAfterHours,
      error: latest.bytes <= 0 ? 'Latest backup is empty' : stale ? 'Latest backup is stale' : null,
    };
  } catch (error: any) {
    const missingDirectory = error?.code === 'ENOENT';
    const warming = missingDirectory && uptimeSeconds < 15 * 60;
    return {
      ok: warming,
      state: warming ? 'warming_up' : missingDirectory ? 'missing' : 'unavailable',
      directory,
      latest_file: null,
      latest_at: null,
      age_minutes: null,
      bytes: null,
      stale_after_hours: staleAfterHours,
      error: warming ? null : (error?.message || 'Backup status unavailable'),
    };
  }
}
