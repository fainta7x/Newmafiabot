import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { getLegacyPreviewRecoveryDir, getPreviewRecoveryDir, restoreGzB64FileAtomically, restoreSqliteFileAtomically, verifySqliteFile } from './previewRecovery.ts';

export const CANONICAL_SNAPSHOT_META = 'mafia_crm.checkpoint.meta.json';
export const CANONICAL_SNAPSHOT_FILE = 'mafia_crm.checkpoint.sqlite.gz.b64';
export const SNAPSHOT_META_TABLE = 'repository_snapshot_meta';

export interface CanonicalSnapshotMeta {
  snapshot_version: string;
  checkpoint_file: string;
  source?: string;
  tournament_id?: string;
  avatar_manifest?: string;
  import_condition?: string;
}

export function readCanonicalSnapshotMeta(rootDir = process.cwd()): CanonicalSnapshotMeta | null {
  const metaPath = path.join(rootDir, CANONICAL_SNAPSHOT_META);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as CanonicalSnapshotMeta;
    return parsed?.snapshot_version && parsed?.checkpoint_file ? parsed : null;
  } catch {
    return null;
  }
}

export function readSnapshotVersionFromSqlite(sqlitePath: string): string | null {
  if (!fs.existsSync(sqlitePath) || fs.statSync(sqlitePath).size === 0) return null;
  try {
    const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    try {
      const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(SNAPSHOT_META_TABLE);
      if (!table) return null;
      const row = db.prepare(`SELECT value FROM ${SNAPSHOT_META_TABLE} WHERE key = ? LIMIT 1`).get('snapshot_version') as { value?: string } | undefined;
      return row?.value || null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export function readSnapshotVersionFromGzB64(gzB64Path: string): string | null {
  if (!fs.existsSync(gzB64Path)) return null;
  const tempPath = path.join(os.tmpdir(), `newmafia-snapshot-version-${process.pid}-${Date.now()}.sqlite`);
  try {
    const encoded = fs.readFileSync(gzB64Path, 'utf8').replace(/\s+/g, '');
    fs.writeFileSync(tempPath, zlib.gunzipSync(Buffer.from(encoded, 'base64')));
    return readSnapshotVersionFromSqlite(tempPath);
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

const recoveryMatchesCanonical = (sqlitePath: string, canonicalVersion: string | null): boolean => {
  if (!canonicalVersion) return true;
  return readSnapshotVersionFromSqlite(sqlitePath) === canonicalVersion;
};

export function initializeProductionRuntimeFromCanonical(
  runtimePath: string,
  rootDir = process.cwd(),
): { initialized: boolean; source: 'existing' | 'canonical' } {
  if (fs.existsSync(runtimePath) && fs.statSync(runtimePath).size > 0) {
    return { initialized: false, source: 'existing' };
  }

  const meta = readCanonicalSnapshotMeta(rootDir);
  if (!meta?.snapshot_version || !meta.checkpoint_file) {
    throw new Error('Canonical repository checkpoint metadata is missing or invalid.');
  }

  const canonicalPath = path.resolve(rootDir, meta.checkpoint_file);
  const rootPath = path.resolve(rootDir);
  if (canonicalPath !== rootPath && !canonicalPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error('Canonical checkpoint path escapes the repository root.');
  }
  if (!fs.existsSync(canonicalPath)) {
    throw new Error(`Canonical repository checkpoint is missing: ${meta.checkpoint_file}`);
  }
  if (readSnapshotVersionFromGzB64(canonicalPath) !== meta.snapshot_version) {
    throw new Error('Canonical repository checkpoint snapshot_version does not match its metadata.');
  }

  if (!restoreGzB64FileAtomically(canonicalPath, runtimePath)) {
    throw new Error('Failed to restore the canonical repository checkpoint atomically.');
  }

  const valid = verifySqliteFile(runtimePath)
    && readSnapshotVersionFromSqlite(runtimePath) === meta.snapshot_version;
  if (!valid) {
    try { fs.unlinkSync(runtimePath); } catch {}
    throw new Error('Restored production database failed canonical integrity/version verification.');
  }

  return { initialized: true, source: 'canonical' };
}

export function initializePreviewRuntimeFromCanonical(
  runtimePath: string,
  rootDir = process.cwd(),
  options: { allowLegacyWithoutCanonical?: boolean } = {},
): { initialized: boolean; source: 'existing' | 'preview-checkpoint' | 'canonical' | 'none' } {
  if (fs.existsSync(runtimePath) && fs.statSync(runtimePath).size > 0) {
    return { initialized: false, source: 'existing' };
  }
  if (fs.existsSync(runtimePath)) fs.unlinkSync(runtimePath);

  const meta = readCanonicalSnapshotMeta(rootDir);
  const canonicalVersion = meta?.snapshot_version || null;
  const recoveryDir = getPreviewRecoveryDir(runtimePath);
  const tmpSqlite = path.join(recoveryDir, 'latest.sqlite');

  if (fs.existsSync(tmpSqlite) && recoveryMatchesCanonical(tmpSqlite, canonicalVersion)) {
    if (restoreSqliteFileAtomically(tmpSqlite, runtimePath)) {
      return { initialized: true, source: 'preview-checkpoint' };
    }
  }
  const tmpCompressed = path.join(recoveryDir, 'latest.sqlite.gz.b64');
  if (fs.existsSync(tmpCompressed) && (!canonicalVersion || readSnapshotVersionFromGzB64(tmpCompressed) === canonicalVersion)) {
    if (restoreGzB64FileAtomically(tmpCompressed, runtimePath)) {
      return { initialized: true, source: 'preview-checkpoint' };
    }
  }

  const canonicalPath = meta
    ? path.join(rootDir, meta.checkpoint_file)
    : path.join(rootDir, CANONICAL_SNAPSHOT_FILE);
  if (fs.existsSync(canonicalPath) && restoreGzB64FileAtomically(canonicalPath, runtimePath)) {
    if (canonicalVersion && readSnapshotVersionFromSqlite(runtimePath) !== canonicalVersion) {
      try { fs.unlinkSync(runtimePath); } catch {}
      throw new Error('Canonical repository snapshot version does not match its metadata.');
    }
    return { initialized: true, source: 'canonical' };
  }

  // Compatibility only for repositories that do not define a canonical versioned snapshot.
  if (!canonicalVersion && options.allowLegacyWithoutCanonical !== false) {
    const legacyDir = getLegacyPreviewRecoveryDir();
    const legacySqlite = path.join(legacyDir, 'latest.sqlite');
    const legacyCompressed = path.join(legacyDir, 'latest.sqlite.gz.b64');
    if (fs.existsSync(legacySqlite) && restoreSqliteFileAtomically(legacySqlite, runtimePath)) {
      return { initialized: true, source: 'preview-checkpoint' };
    }
    if (fs.existsSync(legacyCompressed) && restoreGzB64FileAtomically(legacyCompressed, runtimePath)) {
      return { initialized: true, source: 'preview-checkpoint' };
    }
  }

  return { initialized: false, source: 'none' };
}

export function stampRepositorySnapshot(sqlitePath: string, snapshotVersion: string): void {
  const db = new Database(sqlitePath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${SNAPSHOT_META_TABLE} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const upsert = db.prepare(`
      INSERT INTO ${SNAPSHOT_META_TABLE} (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    upsert.run('snapshot_version', snapshotVersion);
    upsert.run('snapshot_created_at', new Date().toISOString());
  } finally {
    db.close();
  }
}
