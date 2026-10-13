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
  `);
}
