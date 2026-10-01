import type { DatabaseWrapper } from './index.ts';

/** Schema for the owner-only, fail-closed player merge workflow. */
export async function ensurePlayerProfileMergeSchema(db: DatabaseWrapper): Promise<void> {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  const names = new Set(columns.map((column) => String(column.name)));
  if (!names.has('merged_into_player_id')) await db.run('ALTER TABLE players ADD COLUMN merged_into_player_id TEXT');
  if (!names.has('merged_at')) await db.run('ALTER TABLE players ADD COLUMN merged_at TEXT');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS player_profile_merge_previews (
      token_hash TEXT PRIMARY KEY,
      keeper_player_id TEXT NOT NULL,
      source_player_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      preview_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_player_merge_preview_expiry
      ON player_profile_merge_previews(expires_at, used_at);

    CREATE TABLE IF NOT EXISTS player_profile_merges (
      id TEXT PRIMARY KEY,
      keeper_player_id TEXT NOT NULL,
      source_player_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      source_nickname TEXT NOT NULL,
      keeper_nickname TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_player_profile_merges_source
      ON player_profile_merges(source_player_id, created_at DESC);
  `);
}
