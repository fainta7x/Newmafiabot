import type { DatabaseWrapper } from './index.ts';

/**
 * Runs a schema guard once per database connection. Workers call these guards on every tick (every 5–15 s); even a
 * no-op CREATE … IF NOT EXISTS takes the write lock, and with the bot writing to the same file it waited up to
 * 0.6 s on production (owner question 2026-10-22: the server stalls every minute). Concurrent first calls share one
 * run; a failed run is forgotten so the next call tries again.
 */
export function oncePerDatabase(guard: (db: DatabaseWrapper) => Promise<void>): (db: DatabaseWrapper) => Promise<void> {
  const runs = new WeakMap<object, Promise<void>>();
  return (db) => {
    let run = runs.get(db as object);
    if (!run) {
      run = guard(db).catch((error) => { runs.delete(db as object); throw error; });
      runs.set(db as object, run);
    }
    return run;
  };
}
