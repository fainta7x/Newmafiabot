import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import Database from 'better-sqlite3';

const cwd = process.cwd();
const runtimeDbPath = path.join(cwd, 'mafia_crm.runtime.sqlite');
const checkpointDbPath = path.join(cwd, 'mafia_crm.checkpoint.sqlite');
const gzB64Path = path.join(cwd, 'mafia_crm.checkpoint.sqlite.gz.b64');
const tempDbPath = path.join(cwd, `temp_checkpoint_${Date.now()}_${Math.random().toString(36).substring(7)}.sqlite`);

async function run() {
  if (!fs.existsSync(runtimeDbPath)) {
    console.error(`Runtime database not found at ${runtimeDbPath}`);
    process.exit(1);
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(runtimeDbPath, { readonly: true });
    console.log('Starting backup...');
    await db.backup(tempDbPath);
    db.close();
    db = null;

    console.log('Verifying backup...');
    const checkDb = new Database(tempDbPath, { readonly: true });
    const integrity = checkDb.pragma('integrity_check', { simple: false }) as any[];
    
    if (!Array.isArray(integrity) || integrity[0]?.integrity_check !== 'ok') {
      console.error(`Integrity check failed: ${JSON.stringify(integrity)}`);
      checkDb.close();
      fs.unlinkSync(tempDbPath);
      process.exit(1);
    }
    
    const pageSize = checkDb.pragma('page_size', { simple: true }) as number;
    const pageCount = checkDb.pragma('page_count', { simple: true }) as number;
    const expectedSize = pageSize * pageCount;
    checkDb.close();

    const actualSize = fs.statSync(tempDbPath).size;
    if (actualSize !== expectedSize) {
      console.error(`Size mismatch: expected ${expectedSize}, got ${actualSize}`);
      fs.unlinkSync(tempDbPath);
      process.exit(1);
    }

    const fileBuf = fs.readFileSync(tempDbPath);
    const gzBuf = zlib.gzipSync(fileBuf);
    const b64Str = gzBuf.toString('base64');
    fs.writeFileSync(gzB64Path, b64Str, 'utf-8');

    fs.renameSync(tempDbPath, checkpointDbPath);
    console.log(`Checkpoint created successfully at ${checkpointDbPath} and ${gzB64Path}. Size: ${actualSize}, Integrity: ok`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    if (db) db.close();
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    process.exit(1);
  }
}

run();
