import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import Database from 'better-sqlite3';
import type { DatabaseWrapper } from './index.ts';
import { getPreviewRecoveryDir, verifySqliteFile } from './previewRecovery.ts';

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
      const recoveryDir = getPreviewRecoveryDir(wrapper.dbPath);
      if (!fs.existsSync(recoveryDir)) {
        fs.mkdirSync(recoveryDir, { recursive: true });
      }

      const tempFile = path.join(recoveryDir, `temp_checkpoint_${Date.now()}_${Math.random().toString(36).substring(7)}.sqlite`);
      const finalFile = path.join(recoveryDir, 'latest.sqlite');
      const gzB64File = path.join(recoveryDir, 'latest.sqlite.gz.b64');

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
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        throw new Error(`Integrity check failed: ${JSON.stringify(integrityCheck)}`);
      }

      const actualSize = fs.statSync(tempFile).size;
      if (actualSize !== expectedSize) {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        throw new Error(`Size mismatch: expected ${expectedSize}, got ${actualSize}`);
      }

      // Create both files from the same verified generation. latest.sqlite is
      // replaced first because startup always prefers it over the compressed fallback.
      const tempGzFile = path.join(recoveryDir, `temp_gz_${Date.now()}_${Math.random().toString(36).substring(7)}.gz.b64`);
      const fileBuf = fs.readFileSync(tempFile);
      const gzBuf = zlib.gzipSync(fileBuf);
      const b64Str = gzBuf.toString('base64');
      fs.writeFileSync(tempGzFile, b64Str, 'utf-8');
      fs.renameSync(tempFile, finalFile);
      fs.renameSync(tempGzFile, gzB64File);

      if (!verifySqliteFile(finalFile)) {
        throw new Error('Published checkpoint failed the final integrity check');
      }

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
