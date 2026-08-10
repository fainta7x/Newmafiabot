import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import Database from 'better-sqlite3';
import { verifySqliteFile } from '../db/previewRecovery.ts';
import { readCanonicalSnapshotMeta, stampRepositorySnapshot } from '../db/canonicalSnapshot.ts';
import {
  currentSchemaMarker,
  requireNonEmptyFile,
  resolveActiveRuntimeDbPath,
  sha256Bytes,
  type GuardedCheckpointMeta,
} from './checkpointSyncShared.ts';

function atomicWriteText(targetPath: string, content: string): void {
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, targetPath);
  } finally {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }
}

export async function runGitCheckpointScript(): Promise<boolean> {
  const rootDir = process.cwd();
  const runtimePath = resolveActiveRuntimeDbPath(rootDir);
  const metaPath = path.join(rootDir, 'mafia_crm.checkpoint.meta.json');
  const existingMeta = readCanonicalSnapshotMeta(rootDir) as GuardedCheckpointMeta | null;

  if (!existingMeta) {
    console.error('Canonical checkpoint metadata is missing or invalid. Refusing export.');
    return false;
  }

  const targetPath = path.join(rootDir, existingMeta.checkpoint_file);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newmafia-git-export-'));
  const snapshotPath = path.join(tempDir, 'snapshot.sqlite');

  let sourceDb: Database.Database | null = null;
  try {
    requireNonEmptyFile(runtimePath, 'Active runtime database');
    console.log(`Active runtime DB: ${runtimePath}`);
    console.log('Creating a consistent SQLite online backup...');

    sourceDb = new Database(runtimePath, { readonly: true, fileMustExist: true });
    await sourceDb.backup(snapshotPath);

    if (!verifySqliteFile(snapshotPath)) {
      throw new Error('Temporary SQLite snapshot failed integrity_check.');
    }

    stampRepositorySnapshot(snapshotPath, existingMeta.snapshot_version);
    if (!verifySqliteFile(snapshotPath)) {
      throw new Error('Stamped SQLite snapshot failed integrity_check.');
    }

    const sqliteBytes = fs.readFileSync(snapshotPath);
    const checkpointSha256 = sha256Bytes(sqliteBytes);
    const encoded = zlib.gzipSync(sqliteBytes).toString('base64');
    const metadata: GuardedCheckpointMeta = {
      ...existingMeta,
      checkpoint_file: path.basename(targetPath),
      created_at: new Date().toISOString(),
      checksum_algorithm: 'sha256',
      checkpoint_sha256: checkpointSha256,
      schema_marker: currentSchemaMarker(rootDir),
      import_condition: 'development/AI Studio only; target runtime database must be absent or zero-length',
    };

    // Verify the encoded payload before replacing either canonical artifact.
    const roundTrip = zlib.gunzipSync(Buffer.from(encoded, 'base64'));
    if (sha256Bytes(roundTrip) !== checkpointSha256) {
      throw new Error('Checkpoint round-trip checksum mismatch. Refusing export.');
    }

    atomicWriteText(targetPath, encoded);
    atomicWriteText(metaPath, `${JSON.stringify(metadata, null, 2)}\n`);

    console.log(`Canonical checkpoint exported: ${path.basename(targetPath)}`);
    console.log(`SHA-256: ${checkpointSha256}`);
    console.log(`Schema marker: ${metadata.schema_marker}`);
    return true;
  } catch (error: any) {
    console.error(`Checkpoint export refused: ${error?.message || String(error)}`);
    return false;
  } finally {
    try { sourceDb?.close(); } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  process.exitCode = (await runGitCheckpointScript()) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
