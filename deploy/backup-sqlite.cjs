const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const sourcePath = process.env.DATABASE_PATH || '/data/mafia_crm.sqlite';
const backupDir = process.env.SQLITE_BACKUP_DIR || '/data/backups';
const intervalMs = Math.max(60 * 60 * 1000, Number(process.env.SQLITE_BACKUP_INTERVAL_MS || 6 * 60 * 60 * 1000));
const keepCount = Math.max(3, Number(process.env.SQLITE_BACKUP_KEEP || 30));
const firstDelayMs = Math.max(30_000, Number(process.env.SQLITE_BACKUP_FIRST_DELAY_MS || 120_000));

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function cleanupOldBackups() {
  const files = fs.readdirSync(backupDir)
    .filter((name) => /^mafia_crm-.*\.sqlite$/.test(name))
    .map((name) => ({ name, fullPath: path.join(backupDir, name), mtime: fs.statSync(path.join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(keepCount)) {
    try {
      fs.unlinkSync(file.fullPath);
      console.log(`[BACKUP] Removed old SQLite backup ${file.name}`);
    } catch (error) {
      console.error(`[BACKUP] Failed to remove ${file.name}:`, error);
    }
  }
}

async function createBackup() {
  if (!fs.existsSync(sourcePath)) {
    console.warn(`[BACKUP] Source database does not exist yet: ${sourcePath}`);
    return;
  }
  const stat = fs.statSync(sourcePath);
  if (stat.size === 0) {
    console.warn(`[BACKUP] Source database is empty: ${sourcePath}`);
    return;
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const destination = path.join(backupDir, `mafia_crm-${stamp()}.sqlite`);
  const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`integrity_check returned ${String(integrity)}`);
    await db.backup(destination);
    console.log(`[BACKUP] Created ${destination}`);
    cleanupOldBackups();
  } finally {
    db.close();
  }
}

async function run() {
  try {
    await createBackup();
  } catch (error) {
    console.error('[BACKUP] SQLite backup failed:', error);
  }
}

console.log(`[BACKUP] Worker enabled: source=${sourcePath}, dir=${backupDir}, intervalMs=${intervalMs}, keep=${keepCount}`);
setTimeout(() => {
  void run();
  setInterval(() => void run(), intervalMs);
}, firstDelayMs);
