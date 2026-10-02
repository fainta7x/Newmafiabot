import type { DatabaseWrapper } from '../../db/index.ts';

// Tournament roster replacement and the first-game start must never interleave on the
// same better-sqlite3 connection. Keep one queue per DB wrapper so tests / isolated DBs
// remain independent while all relevant mutations on a DB execute in request order.
const mutationTail = new WeakMap<DatabaseWrapper, Promise<unknown>>();

export async function serializeTournamentRosterMutation<T>(
  db: DatabaseWrapper,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = mutationTail.get(db) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  mutationTail.set(db, run);
  try {
    return await run;
  } finally {
    if (mutationTail.get(db) === run) mutationTail.delete(db);
  }
}
