import type { DatabaseWrapper } from '../../db/index.ts';
import { sqliteReadVersion } from './sqliteReadVersion.ts';

/**
 * A version number for «did the inputs of this computation really change». The cache of the finished-game snapshots used
 * to be keyed by `total_changes()` of the shared connection, so any write to any table (a poker save after every action,
 * the token ledger, the chat, a notification) dropped it and the next screen parsed every game protocol again — on a
 * synchronous connection, which stalls the whole server (owner report 2026-10-11, AUDIT_LOG). Here small triggers raise
 * a counter only when one of the listed inputs changes, whichever connection or code path wrote it.
 */
type InputSpec = { table: string; insert?: boolean; delete?: boolean; update?: true | string[] };

/** What `loadCompletedGameSnapshotsUncached` reads. An autosave of a tournament draft or a token change is not on the list. */
export const CLUB_SNAPSHOT_INPUTS: InputSpec[] = [
  { table: 'games', insert: true, delete: true, update: true },
  { table: 'game_evenings', insert: true, delete: true, update: ['title', 'starts_at'] },
  { table: 'tournaments', insert: true, delete: true, update: ['title', 'date'] },
  { table: 'tournament_games', insert: true, delete: true, update: ['tournament_id', 'game_number', 'status', 'winner_team', 'completed_at'] },
  { table: 'tournament_game_seats', insert: true, delete: true, update: true },
  { table: 'tournament_participants', insert: true, delete: true, update: true },
  { table: 'players', insert: true, delete: true, update: ['nickname'] },
];

const installed = new WeakMap<object, Set<string>>();

const safeName = (value: string) => value.replace(/[^a-z0-9_]/gi, '_');

/** True when the counter and all triggers of this key are in place on this database. */
function ensureInputVersion(db: Pick<DatabaseWrapper, 'sqlite'>, key: string, specs: InputSpec[]): boolean {
  const done = installed.get(db as object) ?? new Set<string>();
  if (done.has(key)) return true;
  const sqlite = db.sqlite;
  sqlite.exec('CREATE TABLE IF NOT EXISTS analytics_input_versions (key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)');
  sqlite.prepare('INSERT OR IGNORE INTO analytics_input_versions (key, n) VALUES (?, 0)').run(key);
  const bump = `UPDATE analytics_input_versions SET n = n + 1 WHERE key = '${key.replace(/'/g, "''")}';`;
  for (const spec of specs) {
    const exists = sqlite.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(spec.table);
    if (!exists) return false; // an input we cannot watch: the caller falls back to the conservative version
    const base = `trg_${safeName(key)}_${safeName(spec.table)}`;
    if (spec.insert) sqlite.exec(`CREATE TRIGGER IF NOT EXISTS ${base}_i AFTER INSERT ON ${spec.table} BEGIN ${bump} END`);
    if (spec.delete) sqlite.exec(`CREATE TRIGGER IF NOT EXISTS ${base}_d AFTER DELETE ON ${spec.table} BEGIN ${bump} END`);
    if (spec.update) {
      const columns = spec.update === true ? '' : ` OF ${spec.update.join(', ')}`;
      sqlite.exec(`CREATE TRIGGER IF NOT EXISTS ${base}_u AFTER UPDATE${columns} ON ${spec.table} BEGIN ${bump} END`);
    }
  }
  done.add(key);
  installed.set(db as object, done);
  return true;
}

/**
 * The current version, or null when a view of it must not be cached (inside an open transaction the rows may still be
 * rolled back). If the triggers cannot be installed the old, conservative write counter is used instead.
 */
export function analyticsInputsVersion(db: Pick<DatabaseWrapper, 'sqlite'>, key: string, specs: InputSpec[]): string | null {
  try {
    if (db.sqlite.inTransaction) return null;
    if (!ensureInputVersion(db, key, specs)) return sqliteReadVersion(db);
    const row = db.sqlite.prepare('SELECT n FROM analytics_input_versions WHERE key = ?').get(key) as { n: number } | undefined;
    return row && Number.isSafeInteger(row.n) ? `v${row.n}` : null;
  } catch {
    // Test doubles and non-native connections: no cache.
    return null;
  }
}
