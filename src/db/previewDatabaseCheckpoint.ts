import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { DatabaseWrapper } from './index.ts';

export interface PreviewCheckpointOptions {
  baseDir?: string;
}

export interface PreviewCheckpointResult {
  success: boolean;
  message: string;
  checkpointPath?: string;
  size?: number;
  pageSize?: number;
  pageCount?: number;
}

let checkpointQueue: Promise<void> = Promise.resolve();

function readIntegrityResult(database: Database.Database): string | undefined {
  const rows = database.pragma('integrity_check', { simple: false }) as Array<{
    integrity_check?: string;
  }>;
  return rows[0]?.integrity_check;
}

async function performPreviewCheckpoint(
  wrapper: DatabaseWrapper,
  options: PreviewCheckpointOptions
): Promise<PreviewCheckpointResult> {
  const baseDir = path.resolve(options.baseDir ?? process.cwd());
  const checkpointPath = path.join(baseDir, 'mafia_crm.checkpoint.sqlite');
  const temporaryPath = path.join(
    baseDir,
    `mafia_crm.checkpoint.sqlite-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  );

  fs.mkdirSync(baseDir, { recursive: true });

  try {
    await wrapper.sqlite.backup(temporaryPath);

    let pageSize = 0;
    let pageCount = 0;
    let integrityResult: string | undefined;
    const verificationDb = new Database(temporaryPath, {
      readonly: true,
      fileMustExist: true,
    });

    try {
      integrityResult = readIntegrityResult(verificationDb);
      pageSize = verificationDb.pragma('page_size', { simple: true }) as number;
      pageCount = verificationDb.pragma('page_count', { simple: true }) as number;
    } finally {
      verificationDb.close();
    }

    if (integrityResult !== 'ok') {
      throw new Error(`Integrity check failed: ${integrityResult ?? 'no result'}`);
    }

    const size = fs.statSync(temporaryPath).size;
    const expectedSize = pageSize * pageCount;
    if (size !== expectedSize) {
      throw new Error(`Size mismatch: expected ${expectedSize}, got ${size}`);
    }

    fs.renameSync(temporaryPath, checkpointPath);

    return {
      success: true,
      message: `Checkpoint created successfully. Size: ${size}, Integrity: ok`,
      checkpointPath,
      size,
      pageSize,
      pageCount,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create checkpoint: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.rmSync(temporaryPath, { force: true });
    }
  }
}

export function createPreviewCheckpoint(
  wrapper: DatabaseWrapper,
  options: PreviewCheckpointOptions = {}
): Promise<PreviewCheckpointResult> {
  const isImplicitTestCheckpoint = process.env.NODE_ENV === 'test' && options.baseDir === undefined;
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_PATH || isImplicitTestCheckpoint) {
    return Promise.resolve({
      success: false,
      message: 'Checkpoint disabled in production, tests, or with explicit DATABASE_PATH',
    });
  }

  const queuedCheckpoint = checkpointQueue.then(
    () => performPreviewCheckpoint(wrapper, options),
    () => performPreviewCheckpoint(wrapper, options)
  );

  checkpointQueue = queuedCheckpoint.then(
    () => undefined,
    () => undefined
  );

  return queuedCheckpoint;
}
