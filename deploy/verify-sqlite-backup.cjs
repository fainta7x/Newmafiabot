const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const backupDir = process.env.SQLITE_BACKUP_DIR || '/data/backups';
const requiredTables = ['players', 'game_evenings', 'games'];

function resolveBackupPath(argument) {
  if (argument) return path.resolve(argument);
  if (!fs.existsSync(backupDir)) {
    throw new Error(`Backup directory does not exist: ${backupDir}`);
  }
  const files = fs.readdirSync(backupDir)
    .filter((name) => /^mafia_crm-.*\.sqlite$/.test(name))
    .map((name) => ({
      path: path.join(backupDir, name),
      mtime: fs.statSync(path.join(backupDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) throw new Error(`No SQLite backups found in ${backupDir}`);
  return files[0].path;
}

function verifyStandaloneDatabase(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Backup does not exist: ${filePath}`);
  if (fs.statSync(filePath).size === 0) throw new Error(`Backup is empty: ${filePath}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '2la-noire-backup-verify-'));
  const restoredPath = path.join(tempDir, 'restored.sqlite');
  fs.copyFileSync(filePath, restoredPath);

  const db = new Database(restoredPath, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`integrity_check returned ${String(integrity)}`);

    const rows = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables.map(() => '?').join(',')})`,
    ).all(...requiredTables);
    const present = new Set(rows.map((row) => String(row.name)));
    const missing = requiredTables.filter((name) => !present.has(name));
    if (missing.length) throw new Error(`required tables missing: ${missing.join(', ')}`);

    const counts = Object.fromEntries(requiredTables.map((table) => [
      table,
      Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count || 0),
    ]));

    return {
      backup: filePath,
      bytes: fs.statSync(filePath).size,
      integrity: 'ok',
      required_tables: requiredTables,
      row_counts: counts,
    };
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  const backupPath = resolveBackupPath(process.argv[2]);
  const result = verifyStandaloneDatabase(backupPath);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`[BACKUP-VERIFY] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
