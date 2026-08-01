import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { verifySqliteIntegrity, restoreCheckpointFromGzB64 } from '../db/index.ts';

describe('Protocol Refactor & Recovery Requirements', () => {
  it('verifies restoreCheckpointFromGzB64 recovers corrupt checkpoint.sqlite', () => {
    const cwd = process.cwd();
    const checkpointPath = path.join(cwd, 'test_recovery_checkpoint.sqlite');
    const gzB64Path = path.join(cwd, 'mafia_crm.checkpoint.sqlite.gz.b64');

    // Skip test if gz.b64 doesn't exist yet
    if (!fs.existsSync(gzB64Path)) {
      console.warn('gzB64Path not present, skipping recovery test');
      return;
    }

    // Write garbage to checkpointPath
    fs.writeFileSync(checkpointPath, 'GARBAGE_CORRUPTED_DATA');
    expect(verifySqliteIntegrity(checkpointPath)).toBe(false);

    // Perform restore
    const restored = restoreCheckpointFromGzB64(checkpointPath);
    expect(restored).toBe(true);
    expect(verifySqliteIntegrity(checkpointPath)).toBe(true);

    // Cleanup
    if (fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath);
    }
  });
});
