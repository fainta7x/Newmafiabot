import type { DatabaseWrapper } from './index.ts';

const initialized = new WeakMap<object, Promise<void>>();

/**
 * The deal of a game by the game's key (`club:<id>`, `tournament:<id>`) — the one place of the role deal for every game
 * (owner, 2026-11-09, stage C). The club deal also still lives in `game_virtual_role_deals`, which is MIRRORED by every
 * write until the next release removes it; so an older build that is still running, or a rollback, sees the same state.
 *
 * Runs at startup (not lazily), so every reader of the deal finds the table and the copied club deals from the first request.
 * Idempotent: the copy takes only a NEWER row, so it never moves a row backwards.
 */
async function initialize(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS game_virtual_role_deals (
      game_id INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_role_deals (
      game_key TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  // Club deals made before this table existed (or written by an older build meanwhile).
  await db.run(`
    INSERT INTO game_role_deals (game_key, state_json, updated_at)
    SELECT 'club:' || game_id, state_json, updated_at FROM game_virtual_role_deals WHERE 1 = 1
    ON CONFLICT(game_key) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
     WHERE excluded.updated_at > game_role_deals.updated_at
  `);
  // The key has no foreign key: a deleted game takes its deal with it through these triggers. CREATE TRIGGER goes through
  // run() as a single statement (see ensureEveningSlotsSchema).
  const tableExists = async (name: string) => Boolean(await db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", [name]));
  if (await tableExists('games')) {
    await db.run(`CREATE TRIGGER IF NOT EXISTS trg_game_role_deals_club_delete AFTER DELETE ON games
      BEGIN DELETE FROM game_role_deals WHERE game_key = 'club:' || OLD.id; END`);
  }
  if (await tableExists('tournament_games')) {
    await db.run(`CREATE TRIGGER IF NOT EXISTS trg_game_role_deals_tournament_delete AFTER DELETE ON tournament_games
      BEGIN DELETE FROM game_role_deals WHERE game_key = 'tournament:' || OLD.id; END`);
  }
}

export function ensureGameRoleDealSchema(db: DatabaseWrapper): Promise<void> {
  let ready = initialized.get(db);
  if (!ready) {
    ready = initialize(db).catch((error) => { initialized.delete(db); throw error; });
    initialized.set(db, ready);
  }
  return ready;
}
