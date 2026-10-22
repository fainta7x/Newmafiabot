import type { DatabaseWrapper } from '../../db/index.ts';
import { applyMillourtDuplicateMergeMigration } from '../../db/mergeMillourtDuplicateMigration.ts';

// One-off historical data repairs, run once at server start right after the database opens and before createApp.
// Each is guarded by its migration_history marker and never blocks the start. The Fandorin 2026-08-28 and Chagin
// 2026-09-04 game identity repairs were removed (owner, 2026-10-22): on production they never found their evenings
// and changed nothing.
export async function runStartupHistoricalRepairs(db: DatabaseWrapper): Promise<void> {
  try {
    await applyMillourtDuplicateMergeMigration(db);
  } catch (error) {
    // This is a one-off data hygiene repair. Never make the whole application unavailable
    // if an unexpected historical reference prevents the merge; leave a clear server log instead.
    console.error('[DATA] Millourt duplicate cleanup failed:', error);
  }
}
