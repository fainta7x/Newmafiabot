import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * A constant-time read version for the one shared better-sqlite3 connection.
 * total_changes() sees writes on this connection; data_version sees commits from
 * other connections/processes. Unlike hashing protocol_text, neither scans game
 * history. A non-native/fake connection falls back to uncached reads.
 */
export function sqliteReadVersion(db: Pick<DatabaseWrapper, 'sqlite'>): string | null {
  try {
    const local = db.sqlite.prepare('SELECT total_changes() AS changes').get() as { changes: number };
    const external = db.sqlite.pragma('data_version', { simple: true }) as number;
    if (Number.isSafeInteger(local?.changes) && Number.isSafeInteger(external)) {
      return `${local.changes}:${external}`;
    }
  } catch {
    // Test doubles and non-native database implementations do not expose SQLite pragmas.
  }
  return null;
}
