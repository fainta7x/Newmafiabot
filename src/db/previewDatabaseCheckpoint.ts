import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import Database from 'better-sqlite3';
import { DatabaseWrapper } from './index.ts';

let checkpointPromise: Promise<{ success: boolean; message: string }> | null = null;

export async function createPreviewCheckpoint(wrapper: DatabaseWrapper): Promise<{ success: boolean; message: string }> {
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_PATH) {
    return { success: false, message: 'Checkpoint disabled in production or with explicit DATABASE_PATH' };
  }

  if (checkpointPromise) {
    return checkpointPromise;
  }

  checkpointPromise = (async () => {
    try {
      const cwd = process.cwd();
      const tempFile = path.join(cwd, `temp_checkpoint_${Date.now()}_${Math.random().toString(36).substring(7)}.sqlite`);
      const finalFile = path.join(cwd, 'mafia_crm.checkpoint.sqlite');
      const gzB64File = path.join(cwd, 'mafia_crm.checkpoint.sqlite.gz.b64');

      // Create online backup
      await wrapper.sqlite.backup(tempFile);

      // Verify temp file
      let tempDb: Database.Database | null = null;
      let integrityCheck: any = null;
      let expectedSize = 0;
      try {
        tempDb = new Database(tempFile, { readonly: true });
        integrityCheck = tempDb.pragma('integrity_check', { simple: false });
        
        const pageSize = tempDb.pragma('page_size', { simple: true }) as number;
        const pageCount = tempDb.pragma('page_count', { simple: true }) as number;
        expectedSize = pageSize * pageCount;
      } finally {
        if (tempDb) {
          tempDb.close();
        }
      }

      if (!Array.isArray(integrityCheck) || integrityCheck[0]?.integrity_check !== 'ok') {
        fs.unlinkSync(tempFile);
        throw new Error(`Integrity check failed: ${JSON.stringify(integrityCheck)}`);
      }

      const actualSize = fs.statSync(tempFile).size;
      if (actualSize !== expectedSize) {
        fs.unlinkSync(tempFile);
        throw new Error(`Size mismatch: expected ${expectedSize}, got ${actualSize}`);
      }

      // Create compressed .gz.b64 copy
      const fileBuf = fs.readFileSync(tempFile);
      const gzBuf = zlib.gzipSync(fileBuf);
      const b64Str = gzBuf.toString('base64');
      fs.writeFileSync(gzB64File, b64Str, 'utf-8');

      // Atomically replace
      fs.renameSync(tempFile, finalFile);

      return { 
        success: true, 
        message: `Checkpoint created successfully. Size: ${actualSize}, Integrity: ok` 
      };

    } catch (err) {
      console.error('Error creating checkpoint:', err);
      return { 
        success: false, 
        message: `Failed to create checkpoint: ${err instanceof Error ? err.message : String(err)}` 
      };
    } finally {
      checkpointPromise = null;
    }
  })();

  return checkpointPromise;
}
