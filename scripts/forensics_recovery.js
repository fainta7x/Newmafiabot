import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';

function getSha256(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  } catch (err) {
    return 'error-calc-sha';
  }
}

function inspectSqliteDb(dbPath) {
  let db = null;
  const stat = fs.statSync(dbPath);
  const result = {
    path: dbPath,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
    sha256: getSha256(dbPath),
    integrity: 'unknown',
    error: null,
    players: 0,
    tournaments: 0,
    games: 0,
    protocols: 0,
    completedProtocols: 0,
    playerResults: 0,
    gameStatuses: {},
    gameResultsCount: {},
    maxUpdatedAt: null,
    maxCompletedAt: null,
    lastGameWithData: 0
  };

  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    
    // PRAGMA integrity_check
    try {
      const integrityCheck = db.pragma('integrity_check', { simple: false });
      if (Array.isArray(integrityCheck) && integrityCheck[0]?.integrity_check === 'ok') {
        result.integrity = 'ok';
      } else {
        result.integrity = JSON.stringify(integrityCheck);
      }
    } catch (e) {
      result.integrity = 'error/corrupt: ' + e.message;
      return result;
    }

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    
    if (tables.includes('players')) {
      try {
        result.players = db.prepare("SELECT COUNT(*) as c FROM players").get().c;
      } catch (e) {}
    }

    if (tables.includes('tournaments')) {
      try {
        result.tournaments = db.prepare("SELECT COUNT(*) as c FROM tournaments").get().c;
      } catch (e) {}
    }

    if (tables.includes('tournament_games')) {
      try {
        result.games = db.prepare("SELECT COUNT(*) as c FROM tournament_games").get().c;
        const gameRows = db.prepare("SELECT game_number, status FROM tournament_games ORDER BY game_number ASC").all();
        for (const g of gameRows) {
          result.gameStatuses[g.game_number] = g.status;
        }
      } catch (e) {}
    }

    if (tables.includes('tournament_game_protocols')) {
      try {
        result.protocols = db.prepare("SELECT COUNT(*) as c FROM tournament_game_protocols").get().c;
        result.completedProtocols = db.prepare("SELECT COUNT(*) as c FROM tournament_game_protocols WHERE status = 'completed'").get()?.c || 0;
        
        const prCols = db.prepare("PRAGMA table_info(tournament_game_protocols)").all().map(c => c.name);
        if (prCols.includes('completed_at')) {
          const maxC = db.prepare("SELECT MAX(completed_at) as max_c FROM tournament_game_protocols").get()?.max_c;
          if (maxC) result.maxCompletedAt = maxC;
        }
        if (prCols.includes('updated_at')) {
          const maxU = db.prepare("SELECT MAX(updated_at) as max_u FROM tournament_game_protocols").get()?.max_u;
          if (maxU) result.maxUpdatedAt = maxU;
        }
      } catch (e) {}
    }

    if (tables.includes('tournament_game_player_results')) {
      try {
        result.playerResults = db.prepare("SELECT COUNT(*) as c FROM tournament_game_player_results").get().c;
        const resByGame = db.prepare(`
          SELECT g.game_number, COUNT(r.id) as cnt
          FROM tournament_games g
          LEFT JOIN tournament_game_player_results r ON g.id = r.game_id
          GROUP BY g.game_number
          ORDER BY g.game_number ASC
        `).all();
        for (const r of resByGame) {
          result.gameResultsCount[r.game_number] = r.cnt;
          if (r.cnt > 0 && r.game_number > result.lastGameWithData) {
            result.lastGameWithData = r.game_number;
          }
        }
      } catch (e) {}
    }
  } catch (err) {
    result.integrity = 'error/corrupt';
    result.error = err.message;
  } finally {
    if (db) {
      try { db.close(); } catch (_) {}
    }
  }

  return result;
}

async function runForensics() {
  console.log('=== STEP 1: PROTECT CURRENT STATE ===');
  const cwd = process.cwd();
  const runtimePath = path.join(cwd, 'mafia_crm.runtime.sqlite');
  const safetyBackupPath = path.join(cwd, 'recovery_safety_current_6games.sqlite');

  if (fs.existsSync(runtimePath)) {
    console.log(`Found runtime database at: ${runtimePath}`);
    const srcDb = new Database(runtimePath, { readonly: true });
    await srcDb.backup(safetyBackupPath);
    srcDb.close();
    console.log(`Created safety backup: ${safetyBackupPath}`);

    const safetyInfo = inspectSqliteDb(safetyBackupPath);
    console.log('Safety backup inspection:', JSON.stringify(safetyInfo, null, 2));
  } else {
    console.log('WARNING: Runtime database mafia_crm.runtime.sqlite does not exist!');
  }

  console.log('\n=== STEP 2 & 3: SCANNING AND INSPECTING ALL SQLITE CANDIDATES ===');
  const searchDirs = [cwd, '/tmp'];
  const candidates = new Set();

  function scanDir(dirPath, depth = 0) {
    if (depth > 3) return;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase();
          if (
            lower.endsWith('.sqlite') ||
            lower.endsWith('.sqlite3') ||
            lower.endsWith('.db') ||
            lower.endsWith('.sqlite-wal') ||
            lower.endsWith('.sqlite-journal') ||
            lower.endsWith('.sqlite-shm') ||
            lower.includes('checkpoint') ||
            lower.includes('recovery') ||
            lower.includes('backup') ||
            lower.includes('temp_checkpoint')
          ) {
            candidates.add(fullPath);
          }
        }
      }
    } catch (e) {}
  }

  for (const d of searchDirs) {
    scanDir(d);
  }

  const inspectedResults = [];
  for (const candPath of Array.from(candidates)) {
    if (candPath.endsWith('.gz.b64')) continue;
    if (candPath.endsWith('.sqlite-wal') || candPath.endsWith('.sqlite-journal') || candPath.endsWith('.sqlite-shm')) {
      console.log(`Journal/WAL file found: ${candPath} (Size: ${fs.statSync(candPath).size} bytes, MTime: ${fs.statSync(candPath).mtime.toISOString()})`);
      continue;
    }
    const info = inspectSqliteDb(candPath);
    inspectedResults.push(info);
  }

  console.log('\nInspected SQLite Files Summary:');
  console.log(JSON.stringify(inspectedResults, null, 2));

  console.log('\n=== STEP 4: CHECK ALL B64 COPIES ===');
  const b64Candidates = new Set();
  function scanB64Dir(dirPath, depth = 0) {
    if (depth > 3) return;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          scanB64Dir(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (entry.name.endsWith('.gz.b64')) {
            b64Candidates.add(fullPath);
          }
        }
      }
    } catch (e) {}
  }
  for (const d of searchDirs) scanB64Dir(d);

  const b64InspectedResults = [];
  for (const b64Path of Array.from(b64Candidates)) {
    console.log(`Processing B64 file: ${b64Path}`);
    const tempDbPath = path.join('/tmp', `temp_b64_check_${Date.now()}_${path.basename(b64Path)}.sqlite`);
    try {
      const b64Str = fs.readFileSync(b64Path, 'utf-8').trim();
      const gzBuf = Buffer.from(b64Str, 'base64');
      const decompressedBuf = zlib.gunzipSync(gzBuf);
      fs.writeFileSync(tempDbPath, decompressedBuf);
      const info = inspectSqliteDb(tempDbPath);
      info.originalB64Path = b64Path;
      info.b64Sha256 = getSha256(b64Path);
      b64InspectedResults.push(info);
    } catch (err) {
      console.error(`Failed to decode/gunzip ${b64Path}:`, err.message);
      b64InspectedResults.push({
        originalB64Path: b64Path,
        b64Sha256: getSha256(b64Path),
        integrity: 'error/b64-corrupt',
        error: err.message
      });
    } finally {
      if (fs.existsSync(tempDbPath)) {
        try { fs.unlinkSync(tempDbPath); } catch (_) {}
      }
    }
  }

  console.log('Inspected B64 Candidates Summary:');
  console.log(JSON.stringify(b64InspectedResults, null, 2));

  console.log('\n=== STEP 5: CHECK LOGS ===');
  const logFilesFound = [];
  function scanLogDir(dirPath, depth = 0) {
    if (depth > 3) return;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          scanLogDir(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (entry.name.endsWith('.log') || entry.name.includes('output') || entry.name.includes('server')) {
            logFilesFound.push(fullPath);
          }
        }
      }
    } catch (e) {}
  }
  for (const d of searchDirs) scanLogDir(d);

  console.log('Log files found:', logFilesFound);

  console.log('\n=== STEP 6: CHOOSE BEST CANDIDATE ===');
  const allValidCandidates = [...inspectedResults, ...b64InspectedResults].filter(
    c => c.integrity === 'ok'
  );

  let bestCandidate = null;
  for (const cand of allValidCandidates) {
    if (!bestCandidate) {
      bestCandidate = cand;
    } else {
      if (cand.lastGameWithData > bestCandidate.lastGameWithData) {
        bestCandidate = cand;
      } else if (
        cand.lastGameWithData === bestCandidate.lastGameWithData &&
        cand.playerResults > bestCandidate.playerResults
      ) {
        bestCandidate = cand;
      }
    }
  }

  console.log('Best candidate evaluation result:', bestCandidate);

  if (bestCandidate && bestCandidate.lastGameWithData > 6) {
    console.log(`Found candidate with games > 6: ${bestCandidate.lastGameWithData} games`);
    const bestTargetSqlite = path.join(cwd, 'recovery_candidate_best.sqlite');
    const bestTargetB64 = path.join(cwd, 'recovery_candidate_best.sqlite.gz.b64');

    if (bestCandidate.originalB64Path) {
      const b64Str = fs.readFileSync(bestCandidate.originalB64Path, 'utf-8').trim();
      const gzBuf = Buffer.from(b64Str, 'base64');
      const decompressedBuf = zlib.gunzipSync(gzBuf);
      fs.writeFileSync(bestTargetSqlite, decompressedBuf);

      const gzOutput = zlib.gzipSync(decompressedBuf);
      fs.writeFileSync(bestTargetB64, gzOutput.toString('base64') + '\n');
    } else {
      const candDb = new Database(bestCandidate.path, { readonly: true });
      await candDb.backup(bestTargetSqlite);
      candDb.close();

      const rawBuf = fs.readFileSync(bestTargetSqlite);
      const gzOutput = zlib.gzipSync(rawBuf);
      fs.writeFileSync(bestTargetB64, gzOutput.toString('base64') + '\n');
    }

    const verifiedBestSqlite = inspectSqliteDb(bestTargetSqlite);
    console.log('Verified best candidate sqlite:', verifiedBestSqlite);
    console.log('Best candidate b64 SHA256:', getSha256(bestTargetB64));
  } else {
    console.log('В файловой системе нет восстанавливаемого снимка новее шестой игры.');
  }
}

runForensics().catch(err => {
  console.error('Forensics script failed:', err);
  process.exit(1);
});
