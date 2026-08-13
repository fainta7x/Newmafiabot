import type { DatabaseWrapper } from './index.ts';

export async function ensureVkIntegrationSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS player_external_identities (
      platform TEXT NOT NULL,
      external_user_id TEXT NOT NULL,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      screen_name TEXT,
      display_name TEXT,
      linked_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (platform, external_user_id),
      UNIQUE (platform, player_id)
    );

    CREATE TABLE IF NOT EXISTS vk_evening_publications (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      destination_key TEXT NOT NULL,
      group_id TEXT NOT NULL,
      poll_owner_id INTEGER,
      poll_id INTEGER,
      post_owner_id INTEGER,
      post_id INTEGER,
      answer_map_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      external_url TEXT,
      published_at TEXT,
      updated_at TEXT NOT NULL,
      last_error TEXT,
      PRIMARY KEY (evening_id, destination_key)
    );

    CREATE TABLE IF NOT EXISTS vk_poll_votes (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      destination_key TEXT NOT NULL,
      vk_user_id TEXT NOT NULL,
      answer_id INTEGER,
      response_status TEXT,
      applied_response_status TEXT,
      player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      display_name TEXT,
      screen_name TEXT,
      sync_status TEXT NOT NULL DEFAULT 'unmatched',
      observed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (evening_id, destination_key, vk_user_id)
    );

    CREATE TABLE IF NOT EXISTS vk_callback_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      received_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_external_identity_player
      ON player_external_identities(platform, player_id);
    CREATE INDEX IF NOT EXISTS idx_vk_publications_poll
      ON vk_evening_publications(poll_owner_id, poll_id);
    CREATE INDEX IF NOT EXISTS idx_vk_votes_evening_status
      ON vk_poll_votes(evening_id, sync_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_vk_votes_user
      ON vk_poll_votes(vk_user_id, updated_at DESC);
  `);
}
