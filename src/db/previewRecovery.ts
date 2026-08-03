import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import Database from 'better-sqlite3';

export function verifySqliteFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;

  let db: Database.Database | null = null;
  try {
    db = new Database(filePath, { readonly: true });
    const integrity = db.pragma('integrity_check', { simple: false }) as Array<{ integrity_check?: string }>;
    return Array.isArray(integrity) && integrity[0]?.integrity_check === 'ok';
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

export function getPreviewRecoveryDir(databasePath: string): string {
  const namespace = crypto
    .createHash('sha256')
    .update(path.resolve(databasePath))
    .digest('hex')
    .slice(0, 16);

  return path.join(os.tmpdir(), 'newmafia-preview-recovery', namespace);
}

export function getLegacyPreviewRecoveryDir(): string {
  return path.join(os.tmpdir(), 'newmafia-preview-recovery');
}

function atomicTargetPath(targetPath: string): string {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.restore-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  );
}

export function restoreSqliteFileAtomically(sourcePath: string, targetPath: string): boolean {
  if (!verifySqliteFile(sourcePath)) return false;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempTarget = atomicTargetPath(targetPath);

  try {
    fs.copyFileSync(sourcePath, tempTarget);
    if (!verifySqliteFile(tempTarget)) return false;
    fs.renameSync(tempTarget, targetPath);
    return true;
  } catch {
    return false;
  } finally {
    if (fs.existsSync(tempTarget)) {
      try { fs.unlinkSync(tempTarget); } catch (_) {}
    }
  }
}

export function restoreGzB64FileAtomically(sourcePath: string, targetPath: string): boolean {
  if (!fs.existsSync(sourcePath)) return false;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempTarget = atomicTargetPath(targetPath);

  try {
    const encoded = fs.readFileSync(sourcePath, 'utf8').trim();
    const sqliteBytes = zlib.gunzipSync(Buffer.from(encoded, 'base64'));
    fs.writeFileSync(tempTarget, sqliteBytes);
    if (!verifySqliteFile(tempTarget)) return false;
    fs.renameSync(tempTarget, targetPath);
    return true;
  } catch {
    return false;
  } finally {
    if (fs.existsSync(tempTarget)) {
      try { fs.unlinkSync(tempTarget); } catch (_) {}
    }
  }
}
