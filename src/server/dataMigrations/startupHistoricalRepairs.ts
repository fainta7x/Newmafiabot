import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureJudgeAuthoritySchema } from '../../db/ensureJudgeAuthoritySchema.ts';
import { ensureClubOperationsSchema } from '../../db/ensureClubOperationsSchema.ts';
import { applyMillourtDuplicateMergeMigration } from '../../db/mergeMillourtDuplicateMigration.ts';
import { applyFandorinAug28GameIdentityMigration } from './fixFandorinAug28GameIdentityMigration.ts';
import { applySep4ChaginGameIdentityMigration } from './fixSep4ChaginGameIdentityMigration.ts';

// One-off historical data repairs, run once at server start right after the database opens and before createApp
// (the order they had inside getDb). Each is guarded by its migration_history marker and never blocks the start.
export async function runStartupHistoricalRepairs(db: DatabaseWrapper): Promise<void> {
  try {
    await applyMillourtDuplicateMergeMigration(db);
  } catch (error) {
    // This is a one-off data hygiene repair. Never make the whole application unavailable
    // if an unexpected historical reference prevents the merge; leave a clear server log instead.
    console.error('[DATA] Millourt duplicate cleanup failed:', error);
  }
  // The historical game repair depends on both judge_level and club_role because it
  // re-runs canonical evening pricing after swapping the player identity. Ensure the
  // same operational schema that createApp uses exists before the one-off migration.
  await ensureJudgeAuthoritySchema(db);
  await ensureClubOperationsSchema(db);
  try {
    await applyFandorinAug28GameIdentityMigration(db);
  } catch (error) {
    // This repair is deliberately narrow and fail-closed. A data mismatch must never
    // reset/replace the database or prevent the application from starting.
    console.error('[DATA] Fandorin 2026-08-28 game identity repair failed:', error);
  }
  try {
    await applySep4ChaginGameIdentityMigration(db);
  } catch (error) {
    console.error('[DATA] Confirmed 2026-09-04 game identity repair failed:', error);
  }
}
