import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDb } from '../db/index.ts';
import {
  verifyDatabaseIntegrityAndStats,
  compressAndSaveGitCheckpoint,
  restoreGitCheckpointToSqlite,
} from '../db/gitCheckpointUtils.ts';

export async function runGitCheckpointScript(): Promise<boolean> {
  console.log('=== CREATING GIT CHECKPOINT FROM ACTIVE RUNTIME DB ===');

  const rootDir = process.cwd();
  const targetB64Path = path.join(rootDir, 'mafia_crm.checkpoint.sqlite.gz.b64');

  const tmpDir = path.join(os.tmpdir(), `git_checkpoint_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const backupSqlitePath = path.join(tmpDir, 'backup.sqlite');
  const pendingB64Path = path.join(tmpDir, 'mafia_crm.checkpoint.sqlite.gz.b64.pending');
  const restoredSqlitePath = path.join(tmpDir, 'restored.sqlite');

  try {
    // 1. Get DB connection to actual runtime database
    const dbWrapper = await getDb();
    console.log(`Runtime DB Path: ${dbWrapper.dbPath}`);

    // 2. Perform online SQLite backup to temporary file
    console.log('1. Performing online SQLite backup to temporary file...');
    await dbWrapper.sqlite.backup(backupSqlitePath);

    // 3. Verify backup database integrity and tournament stats
    console.log('2. Verifying temporary backup database integrity and stats...');
    const backupStats = verifyDatabaseIntegrityAndStats(backupSqlitePath);

    console.log(`✓ Integrity: ok. Total tournaments: ${backupStats.totalTournaments}`);
    console.log(`✓ "Турнир Богдана 1.08": ${backupStats.bogdanaStats.totalGames} games total, ${backupStats.bogdanaStats.completedProtocols} completed protocols.`);
    console.log(`  - Game #7: game status=${backupStats.bogdanaStats.game7.gameStatus}, protocol status=${backupStats.bogdanaStats.game7.protocolStatus}, results=${backupStats.bogdanaStats.game7.resultsCount}`);
    console.log(`  - Game #8: game status=${backupStats.bogdanaStats.game8.gameStatus}, protocol status=${backupStats.bogdanaStats.game8.protocolStatus}, results=${backupStats.bogdanaStats.game8.resultsCount}`);

    // 4. Compress to temporary pending b64 file inside temp dir
    console.log('3. Compressing backup to temporary pending checkpoint file...');
    compressAndSaveGitCheckpoint(backupSqlitePath, pendingB64Path);

    // 5. Restore pending b64 file to second temp SQLite file and repeat verification
    console.log('4. Restoring pending checkpoint to verify roundtrip integrity...');
    restoreGitCheckpointToSqlite(pendingB64Path, restoredSqlitePath);

    const restoredStats = verifyDatabaseIntegrityAndStats(restoredSqlitePath);
    console.log(`✓ Restored checkpoint integrity OK (${restoredStats.totalTournaments} tournaments)! Games #7 & #8 verified.`);

    // 6. Atomically replace root mafia_crm.checkpoint.sqlite.gz.b64 ONLY after successful verification
    console.log('5. Atomically replacing root checkpoint file...');
    const tmpRootSwap = `${targetB64Path}.swap_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    fs.copyFileSync(pendingB64Path, tmpRootSwap);
    fs.renameSync(tmpRootSwap, targetB64Path);

    const rootFileSize = fs.statSync(targetB64Path).size;
    console.log(`✓ Root checkpoint updated atomically: ${path.basename(targetB64Path)} (${rootFileSize} bytes)`);

    console.log('\n======================================================');
    console.log('SUCCESS: Git checkpoint updated and verified 100%!');
    console.log('======================================================');
    return true;
  } catch (err: any) {
    console.error('\n❌ FAILED TO CREATE GIT CHECKPOINT:');
    console.error(err?.message || String(err));
    return false;
  } finally {
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
