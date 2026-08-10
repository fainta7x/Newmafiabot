import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { verifySqliteFile } from '../db/previewRecovery.ts';
import {
  currentSchemaMarker,
  decodeCheckpointBase64,
  readGuardedCheckpointMeta,
  resolveActiveRuntimeDbPath,
  sha256Bytes,
} from './checkpointSyncShared.ts';

const CANONICAL_CHECKPOINT = 'mafia_crm.checkpoint.sqlite.gz.b64';
const CANONICAL_META = 'mafia_crm.checkpoint.meta.json';

export function runGitCheckpointImport(): boolean {
  const rootDir = process.cwd();
  const runtimePath = resolveActiveRuntimeDbPath(rootDir);
  const metaPath = path.join(rootDir, CANONICAL_META);
  const checkpointPath = path.join(rootDir, CANONICAL_CHECKPOINT);

  try {
    if (fs.existsSync(runtimePath) && fs.statSync(runtimePath).size > 0) {
      throw new Error(`Active runtime database is non-empty (${runtimePath}). Refusing to overwrite it.`);
    }

    const meta = readGuardedCheckpointMeta(metaPath);
    if (meta.checkpoint_file !== CANONICAL_CHECKPOINT) {
      throw new Error(`Metadata must reference ${CANONICAL_CHECKPOINT}. Refusing import.`);
    }
    if (meta.checksum_algorithm !== 'sha256' || !meta.checkpoint_sha256) {
      throw new Error('Checkpoint metadata has no SHA-256 checksum. Export a verified checkpoint first.');
    }
    if (!meta.schema_marker) {
      throw new Error('Checkpoint metadata has no schema marker. Export a verified checkpoint first.');
    }

    const expectedSchemaMarker = currentSchemaMarker(rootDir);
    if (meta.schema_marker !== expectedSchemaMarker) {
      throw new Error(`Checkpoint schema marker does not match the current repository. Expected ${expectedSchemaMarker}, got ${meta.schema_marker}.`);
    }

    const encoded = fs.readFileSync(checkpointPath, 'utf8');
    const compressedBytes = decodeCheckpointBase64(encoded);
    const actualChecksum = sha256Bytes(compressedBytes);
    if (actualChecksum !== meta.checkpoint_sha256) {
      throw new Error(`Checkpoint SHA-256 mismatch. Expected ${meta.checkpoint_sha256}, got ${actualChecksum}.`);
    }

    let sqliteBytes: Buffer;
    try {
      sqliteBytes = zlib.gunzipSync(compressedBytes);
    } catch {
      throw new Error('Canonical checkpoint is not valid gzip data.');
    }
    if (!sqliteBytes.length) {
      throw new Error('Canonical checkpoint contains an empty SQLite payload.');
    }

    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    const tempTarget = path.join(
      path.dirname(runtimePath),
      `.${path.basename(runtimePath)}.import-${process.pid}-${Date.now()}.tmp`,
    );

    try {
      fs.writeFileSync(tempTarget, sqliteBytes);
      if (!verifySqliteFile(tempTarget)) {
        throw new Error('Decoded checkpoint failed SQLite integrity_check.');
      }

      // Re-check immediately before the only write to the runtime path.
      if (fs.existsSync(runtimePath) && fs.statSync(runtimePath).size > 0) {
        throw new Error(`Runtime database became non-empty during import (${runtimePath}). Refusing to overwrite it.`);
      }
      if (fs.existsSync(runtimePath)) {
        fs.unlinkSync(runtimePath); // Allowed only because it is still zero-length.
      }
      fs.renameSync(tempTarget, runtimePath);
    } finally {
      if (fs.existsSync(tempTarget)) {
        try { fs.unlinkSync(tempTarget); } catch {}
      }
    }

    console.log(`Canonical checkpoint imported into empty runtime path: ${runtimePath}`);
    console.log(`Verified checkpoint SHA-256: ${actualChecksum}`);
    return true;
  } catch (error: any) {
    console.error(`Checkpoint import refused: ${error?.message || String(error)}`);
    return false;
  }
}

process.exitCode = runGitCheckpointImport() ? 0 : 1;
