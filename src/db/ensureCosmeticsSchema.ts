import type { DatabaseWrapper } from './index.ts';

/** Additive, no seed rewards, no wallet writes, no changes to existing player data. */
export async function ensureCosmeticsSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cosmetic_seasons (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 1 CHECK(paid=1),
      level_thresholds_json TEXT NOT NULL DEFAULT '[]', duplicate_xp_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cosmetic_catalog (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, rarity TEXT NOT NULL, slot TEXT NOT NULL,
      asset_key TEXT NOT NULL, season_id TEXT REFERENCES cosmetic_seasons(id),
      published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cosmetic_inventory (
      player_id TEXT NOT NULL REFERENCES players(id), item_id TEXT NOT NULL REFERENCES cosmetic_catalog(id),
      quantity INTEGER NOT NULL CHECK(quantity>=1), acquired_at TEXT NOT NULL,
      PRIMARY KEY(player_id,item_id)
    );
    CREATE TABLE IF NOT EXISTS cosmetic_equipment (
      player_id TEXT NOT NULL REFERENCES players(id), slot TEXT NOT NULL,
      item_id TEXT NOT NULL REFERENCES cosmetic_catalog(id), updated_at TEXT NOT NULL,
      PRIMARY KEY(player_id,slot)
    );
    CREATE TABLE IF NOT EXISTS compendium_memberships (
      player_id TEXT NOT NULL REFERENCES players(id), season_id TEXT NOT NULL REFERENCES cosmetic_seasons(id),
      payment_reference TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0 CHECK(xp>=0),
      activated_at TEXT NOT NULL, PRIMARY KEY(player_id,season_id)
    );
    CREATE TABLE IF NOT EXISTS cosmetic_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL REFERENCES players(id),
      request_id TEXT NOT NULL, operation TEXT NOT NULL, payload_json TEXT NOT NULL,
      result_json TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(player_id,request_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cosmetic_catalog_season ON cosmetic_catalog(season_id,published);
    CREATE INDEX IF NOT EXISTS idx_cosmetic_events_player ON cosmetic_events(player_id,id);
    CREATE TABLE IF NOT EXISTS player_role_looks (
      player_id TEXT NOT NULL REFERENCES players(id), role TEXT NOT NULL CHECK(role IN ('civilian','mafia','don','sheriff')),
      phrase TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT 'noir',
      hat_item_id TEXT REFERENCES cosmetic_catalog(id), jacket_item_id TEXT REFERENCES cosmetic_catalog(id),
      revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, PRIMARY KEY(player_id,role)
    );
    -- A set is a thematic grouping, never a stackable inventory item.
    -- Its rarity is independent from the rarity of its constituent items.
    CREATE TABLE IF NOT EXISTS cosmetic_sets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rarity TEXT NOT NULL CHECK(rarity IN ('common','uncommon','rare','epic','legendary','mythic')),
      season_id TEXT REFERENCES cosmetic_seasons(id),
      published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cosmetic_set_items (
      set_id TEXT NOT NULL REFERENCES cosmetic_sets(id),
      item_id TEXT NOT NULL REFERENCES cosmetic_catalog(id),
      PRIMARY KEY(set_id,item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cosmetic_set_items_item ON cosmetic_set_items(item_id);
    -- Future multi-slot role equipment; old columns remain the public contract
    -- until clients and broadcasts have migrated. No rewards are seeded.
    CREATE TABLE IF NOT EXISTS player_role_look_equipment (
      player_id TEXT NOT NULL REFERENCES players(id),
      role TEXT NOT NULL CHECK(role IN ('civilian','mafia','don','sheriff')),
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL REFERENCES cosmetic_catalog(id),
      PRIMARY KEY(player_id,role,slot)
    );
    CREATE INDEX IF NOT EXISTS idx_role_look_equipment_item ON player_role_look_equipment(item_id);
    CREATE TABLE IF NOT EXISTS player_portrait_versions (
      version TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id),
      image_data BLOB NOT NULL, created_at TEXT NOT NULL, approved_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS player_portrait_current (
      player_id TEXT PRIMARY KEY REFERENCES players(id), version TEXT NOT NULL REFERENCES player_portrait_versions(version)
    );
    CREATE TABLE IF NOT EXISTS game_role_look_snapshots (
      game_key TEXT NOT NULL, player_id TEXT NOT NULL REFERENCES players(id),
      role TEXT NOT NULL, look_json TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(game_key,player_id,role)
    );
  `);
  // Preserve existing wardrobes when upgrading an already populated database.
  // This mirrors legacy slots only; new slots are not enabled by this migration.
  await db.run(`INSERT OR IGNORE INTO player_role_look_equipment(player_id,role,slot,item_id)
    SELECT player_id,role,'portrait_hat',hat_item_id FROM player_role_looks WHERE hat_item_id IS NOT NULL`);
  await db.run(`INSERT OR IGNORE INTO player_role_look_equipment(player_id,role,slot,item_id)
    SELECT player_id,role,'portrait_jacket',jacket_item_id FROM player_role_looks WHERE jacket_item_id IS NOT NULL`);
}
