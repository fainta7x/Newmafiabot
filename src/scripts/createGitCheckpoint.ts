import path from 'path';
import fs from 'fs';
import os from 'os';
import Database from 'better-sqlite3';
import { getDb, type DatabaseWrapper } from '../db/index.ts';
import {
  verifyDatabaseIntegrityAndStats,
  compressAndSaveGitCheckpoint,
  restoreGitCheckpointToSqlite,
} from '../db/gitCheckpointUtils.ts';

export interface GitCheckpointOptions {
  getDbFn?: () => Promise<DatabaseWrapper>;
  dbWrapper?: DatabaseWrapper;
  dbPath?: string;
  targetB64Path?: string;
}

export async function runGitCheckpointScript(options: GitCheckpointOptions = {}): Promise<boolean> {
  console.log('=== CREATING GIT CHECKPOINT FROM ACTIVE RUNTIME DB ===');

  const rootDir = process.cwd();
  const targetB64Path = options.targetB64Path ?? path.join(rootDir, 'mafia_crm.checkpoint.sqlite.gz.b64');

  const tmpDir = path.join(os.tmpdir(), `git_checkpoint_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const backupSqlitePath = path.join(tmpDir, 'backup.sqlite');
  const pendingB64Path = path.join(tmpDir, 'mafia_crm.checkpoint.sqlite.gz.b64.pending');
  const restoredSqlitePath = path.join(tmpDir, 'restored.sqlite');

  let dbToClose: Database.Database | null = null;

  try {
    // 1. Get DB connection to actual runtime database or options source
    if (options.dbPath) {
      console.log(`Runtime DB Path: ${options.dbPath}`);
      dbToClose = new Database(options.dbPath, { readonly: true });
      console.log('1. Performing online SQLite backup to temporary file...');
      await dbToClose.backup(backupSqlitePath);
    } else if (options.dbWrapper) {
      console.log(`Runtime DB Path: ${options.dbWrapper.dbPath}`);
      console.log('1. Performing online SQLite backup to temporary file...');
      await options.dbWrapper.sqlite.backup(backupSqlitePath);
    } else {
      const dbWrapper = options.getDbFn ? await options.getDbFn() : await getDb();
      console.log(`Runtime DB Path: ${dbWrapper.dbPath}`);
      console.log('1. Performing online SQLite backup to temporary file...');
      await dbWrapper.sqlite.backup(backupSqlitePath);
    }

    // 2. Verify backup database integrity and tournament stats
    console.log('2. Verifying temporary backup database integrity and stats...');
    const backupStats = verifyDatabaseIntegrityAndStats(backupSqlitePath);

    console.log(`✓ Integrity: ok. Total tournaments: ${backupStats.totalTournaments}`);
    console.log(`✓ "Турнир Богдана 1.08": ${backupStats.bogdanaStats.totalGames} games total, ${backupStats.bogdanaStats.completedProtocols} completed protocols.`);
    console.log(`  - Game #7: game status=${backupStats.bogdanaStats.game7.gameStatus}, protocol status=${backupStats.bogdanaStats.game7.protocolStatus}, results=${backupStats.bogdanaStats.game7.resultsCount}`);
    console.log(`  - Game #8: game status=${backupStats.bogdanaStats.game8.gameStatus}, protocol status=${backupStats.bogdanaStats.game8.protocolStatus}, results=${backupStats.bogdanaStats.game8.resultsCount}`);

    // 3. Compress to temporary pending b64 file inside temp dir
    console.log('3. Compressing backup to temporary pending checkpoint file...');
    compressAndSaveGitCheckpoint(backupSqlitePath, pendingB64Path);

    // 4. Restore pending b64 file to second temp SQLite file and repeat verification
    console.log('4. Restoring pending checkpoint to verify roundtrip integrity...');
    restoreGitCheckpointToSqlite(pendingB64Path, restoredSqlitePath);

    const restoredStats = verifyDatabaseIntegrityAndStats(restoredSqlitePath);
    console.log(`✓ Restored checkpoint integrity OK (${restoredStats.totalTournaments} tournaments)! Games #7 & #8 verified.`);

    // 5. Atomically replace target checkpoint file ONLY after successful verification
    console.log('5. Atomically replacing target checkpoint file...');
    const targetDir = path.dirname(targetB64Path);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const tmpRootSwap = `${targetB64Path}.swap_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    fs.copyFileSync(pendingB64Path, tmpRootSwap);
    fs.renameSync(tmpRootSwap, targetB64Path);

    const rootFileSize = fs.statSync(targetB64Path).size;
    console.log(`✓ Target checkpoint updated atomically: ${path.basename(targetB64Path)} (${rootFileSize} bytes)`);

    console.log('\n======================================================');
    console.log('SUCCESS: Git checkpoint updated and verified 100%!');
    console.log('======================================================');
    return true;
  } catch (err: any) {
    console.error('\n❌ FAILED TO CREATE GIT CHECKPOINT:');
    console.error(err?.message || String(err));
    return false;
  } finally {
    if (dbToClose) {
      try { dbToClose.close(); } catch (_) {}
    }
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }
}

async function main() {
  const success = await runGitCheckpointScript();
  process.exitCode = success ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
