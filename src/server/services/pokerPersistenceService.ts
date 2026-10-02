import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePokerRuntimeSchema } from '../../db/ensurePokerRuntimeSchema.ts';
import {
  createPokerRuntimeState,
  exportPokerRuntimeSnapshot,
  type PokerRuntimeSnapshot,
  type PokerRuntimeState,
  withPokerRuntimeState,
} from './pokerLobbyService.ts';

type CachedRuntime = { state: PokerRuntimeState; queue: Promise<void> };
let runtimes = new WeakMap<DatabaseWrapper, Promise<CachedRuntime>>();

const parseSnapshot = (value: string): PokerRuntimeSnapshot => {
  const parsed = JSON.parse(value) as Partial<PokerRuntimeSnapshot>;
  if (parsed.version !== 1 || !Array.isArray(parsed.lobbies) || !parsed.bankrolls || typeof parsed.bankrolls !== 'object') {
    throw new Error('Сохранённое состояние Poker имеет неизвестный формат.');
  }
  return parsed as PokerRuntimeSnapshot;
};

const loadRuntime = async (db: DatabaseWrapper): Promise<CachedRuntime> => {
  await ensurePokerRuntimeSchema(db);
  const row = await db.get<{ state_json: string }>(`SELECT state_json FROM poker_runtime_state WHERE id='main' LIMIT 1`);
  const snapshot = row?.state_json ? parseSnapshot(row.state_json) : undefined;
  return { state: createPokerRuntimeState(snapshot), queue: Promise.resolve() };
};

const cachedRuntime = (db: DatabaseWrapper) => {
  let cached = runtimes.get(db);
  if (!cached) {
    cached = loadRuntime(db);
    runtimes.set(db, cached);
  }
  return cached;
};

/**
 * Serializes requests for one SQLite database, restores its in-memory poker room once,
 * and writes only when a real poker mutation changed the compact snapshot.
 */
export async function withPersistedPokerRuntime<T>(db: DatabaseWrapper, callback: () => T | Promise<T>): Promise<T> {
  const cached = await cachedRuntime(db);
  const previous = cached.queue;
  let release = () => {};
  cached.queue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await withPokerRuntimeState(cached.state, async () => {
      const before = JSON.stringify(exportPokerRuntimeSnapshot());
      const result = await callback();
      const after = JSON.stringify(exportPokerRuntimeSnapshot());
      if (after !== before) {
        await db.run(
          `INSERT INTO poker_runtime_state (id,state_json,updated_at) VALUES ('main',?,?)
           ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`,
          [after, new Date().toISOString()],
        );
      }
      return result;
    });
  } finally {
    release();
  }
}

/** Simulates a fresh Node process without touching the durable SQLite row. */
export function resetPokerRuntimeCacheForTesting(db?: DatabaseWrapper) {
  if (db) runtimes.delete(db);
  else runtimes = new WeakMap();
}
