import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface GuardedCheckpointMeta {
  snapshot_version: string;
  checkpoint_file: string;
  source?: string;
  tournament_id?: string;
  avatar_manifest?: string;
  import_condition?: string;
  created_at?: string;
  checksum_algorithm?: 'sha256';
  checkpoint_sha256?: string;
  schema_marker?: string;
}

export function resolveActiveRuntimeDbPath(rootDir = process.cwd()): string {
  let configured = process.env.DATABASE_PATH?.trim();

  if (!configured || configured === './mafia_crm.sqlite' || configured === 'mafia_crm.sqlite') {
    configured = process.env.NODE_ENV === 'production' ? 'mafia_crm.sqlite' : 'mafia_crm.runtime.sqlite';
  }

  return path.resolve(rootDir, configured);
}

export function requireNonEmptyFile(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
  if (fs.statSync(filePath).size === 0) {
    throw new Error(`${label} is empty: ${filePath}`);
  }
}

export function sha256Bytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function decodeCheckpointBase64(encodedText: string): Buffer {
  const compact = encodedText.replace(/\s+/g, '');
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new Error('Canonical checkpoint is not valid base64.');
  }

  const decoded = Buffer.from(compact, 'base64');
  if (!decoded.length) {
    throw new Error('Canonical checkpoint decoded to an empty payload.');
  }
  return decoded;
}

export function readGuardedCheckpointMeta(metaPath: string): GuardedCheckpointMeta {
  requireNonEmptyFile(metaPath, 'Canonical checkpoint metadata');
  const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as GuardedCheckpointMeta;
  if (!parsed?.snapshot_version || !parsed?.checkpoint_file) {
    throw new Error('Canonical checkpoint metadata is missing snapshot_version or checkpoint_file.');
  }
  return parsed;
}

export function currentSchemaMarker(rootDir = process.cwd()): string {
  const drizzleDir = path.join(rootDir, 'drizzle');
  const migrations = fs.existsSync(drizzleDir)
    ? fs.readdirSync(drizzleDir).filter((name) => name.endsWith('.sql')).sort()
    : [];
  const latestMigration = migrations.at(-1) || 'none';

  const digest = crypto.createHash('sha256');
  for (const name of migrations) {
    digest.update(name);
    digest.update(fs.readFileSync(path.join(drizzleDir, name)));
  }
  for (const schemaFile of ['src/db/schema.ts', 'src/db/schemaBase.ts']) {
    const fullPath = path.join(rootDir, schemaFile);
    if (fs.existsSync(fullPath)) {
      digest.update(schemaFile);
      digest.update(fs.readFileSync(fullPath));
    }
  }

  return `${latestMigration};sha256=${digest.digest('hex')}`;
}
