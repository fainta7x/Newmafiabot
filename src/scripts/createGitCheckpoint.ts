import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDb } from '../db/index.ts';
import {
  verifyDatabaseIntegrityAndStats,
  compressAndSaveGitCheckpoint,
  restoreGitCheckpointToSqlite,
} from '../db/gitCheckpointUtils.ts';

async function main() {
  console.log('=== CREATING GIT CHECKPOINT FROM ACTIVE RUNTIME DB ===');

  const rootDir = process.cwd();
  const targetB64Path = path.join(rootDir, 'mafia_crm.checkpoint.sqlite.gz.b64');

  const tmpDir = path.join(os.tmpdir(), `git_checkpoint_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const backupSqlitePath = path.join(tmpDir, 'backup.sqlite');
  const restoredSqlitePath = path.join(tmpDir, 'restored.sqlite');

  try {
    // 1. Get DB connection to actual runtime database
    const db = await getDb();

    // 2. Perform online SQLite backup to temporary file
    console.log('1. Performing online SQLite backup...');
    await db.sqlite.backup(backupSqlitePath);

    // 3-5. Verify backup file integrity and tournament stats
    console.log('2. Verifying backup database integrity and tournament stats...');
    const backupStats = verifyDatabaseIntegrityAndStats(backupSqlitePath);

    console.log(`✓ Backup integrity OK. Total tournaments: ${backupStats.totalTournaments}`);
    console.log(`✓ "Турнир Богдана 1.08" stats: ${backupStats.bogdanaStats.completedGames}/${backupStats.bogdanaStats.totalGames} games completed.`);
    console.log(`  - Game 7: status="${backupStats.bogdanaStats.game7.status}", results=${backupStats.bogdanaStats.game7.resultsCount}`);
    console.log(`  - Game 8: status="${backupStats.bogdanaStats.game8.status}", results=${backupStats.bogdanaStats.game8.resultsCount}`);

    // 7-8. Compress verified copy to gzip+base64 and write atomically
    console.log('3. Compressing and atomically updating mafia_crm.checkpoint.sqlite.gz.b64...');
    compressAndSaveGitCheckpoint(backupSqlitePath, targetB64Path);
    console.log(`✓ Updated ${path.basename(targetB64Path)} (size: ${fs.statSync(targetB64Path).size} bytes)`);

    // 9-10. Restore created file to temp SQLite file and repeat verification
    console.log('4. Restoring generated Git checkpoint to verify roundtrip integrity...');
    restoreGitCheckpointToSqlite(targetB64Path, restoredSqlitePath);

    verifyDatabaseIntegrityAndStats(restoredSqlitePath);
    console.log(`✓ Restored checkpoint integrity OK! Games 7 & 8 verified.`);

    console.log('\n======================================================');
    console.log('SUCCESS: Git checkpoint updated and verified 100%!');
    console.log('======================================================');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ FAILED TO CREATE GIT CHECKPOINT:');
    console.error(err?.message || String(err));
    process.exit(1);
  } finally {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }
}

main();
