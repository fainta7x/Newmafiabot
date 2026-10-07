import { observePokerHand, withOpponentMemory, type OpponentMemory } from './pokerBot.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePokerRuntimeSchema } from '../../db/ensurePokerRuntimeSchema.ts';
import {
  createPokerRuntimeState,
  confirmPokerHandLog,
  pendingPokerHandLog,
  exportPokerRuntimeSnapshot,
  type StoredPokerHand,
  type PokerRuntimeSnapshot,
  type PokerRuntimeState,
  withPokerRuntimeState,
} from './pokerLobbyService.ts';

/** How many finished hands are kept, and how many of the newest ones the bots re-learn from at start. */
export const POKER_HAND_LOG_KEEP = 20000;
const POKER_HAND_LOG_REPLAY = 5000;

type CachedRuntime = { state: PokerRuntimeState; queue: Promise<void>; invalidated: boolean };
let runtimes = new WeakMap<DatabaseWrapper, Promise<CachedRuntime>>();

const parseSnapshot = (value: string): PokerRuntimeSnapshot => {
  const parsed = JSON.parse(value) as Partial<PokerRuntimeSnapshot>;
  if (parsed.version !== 1 || !Array.isArray(parsed.lobbies) || !parsed.bankrolls || typeof parsed.bankrolls !== 'object') {
    throw new Error('Сохранённое состояние Poker имеет неизвестный формат.');
  }
  return parsed as PokerRuntimeSnapshot;
};

/** The bots' memory of the players lives in the process: after a restart it is rebuilt from the stored hands. */
const replayStoredHands = async (db: DatabaseWrapper, memory: OpponentMemory) => {
  const rows = await db.all<{ hand_json: string }>(`SELECT hand_json FROM poker_hand_log ORDER BY played_at DESC LIMIT ?`, [POKER_HAND_LOG_REPLAY]).catch(() => []);
  for (const row of rows.reverse()) {
    try {
      const hand = JSON.parse(row.hand_json) as StoredPokerHand;
      withOpponentMemory(memory, () => observePokerHand({ players: hand.players, action_log: hand.actions.map(([street, player_id, type, amount]) => ({ street, player_id, type, amount })) }));
    } catch { /* a damaged row is skipped, the rest still teach */ }
  }
};

const writeHandLog = async (db: DatabaseWrapper, hands: StoredPokerHand[]) => {
  if (!hands.length) return;
  for (const hand of hands) {
    await db.run(`INSERT OR IGNORE INTO poker_hand_log (id, played_at, hand_json) VALUES (?,?,?)`, [hand.id, hand.at, JSON.stringify(hand)]);
  }
  await db.run(`DELETE FROM poker_hand_log WHERE id IN (SELECT id FROM poker_hand_log ORDER BY played_at DESC LIMIT -1 OFFSET ?)`, [POKER_HAND_LOG_KEEP]);
};

const loadRuntime = async (db: DatabaseWrapper): Promise<CachedRuntime> => {
  await ensurePokerRuntimeSchema(db);
  const row = await db.get<{ state_json: string }>(`SELECT state_json FROM poker_runtime_state WHERE id='main' LIMIT 1`);
  const snapshot = row?.state_json ? parseSnapshot(row.state_json) : undefined;
  const state = createPokerRuntimeState(snapshot);
  await replayStoredHands(db, state.memory!);
  return { state, queue: Promise.resolve(), invalidated: false };
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
    if (cached.invalidated) {
      // A request that was already queued before a rollback still holds this same cache object. Reload the committed
      // SQLite snapshot here so no queued request can persist the failed request's mutated in-memory room.
      const restored = await loadRuntime(db);
      cached.state = restored.state;
      cached.invalidated = false;
    }
    return await withPokerRuntimeState(cached.state, async () => {
      try {
        const committed = await db.transaction(async (tx) => {
          const before = JSON.stringify(exportPokerRuntimeSnapshot());
          const result = await callback();
          const after = JSON.stringify(exportPokerRuntimeSnapshot());
          const pending = pendingPokerHandLog();
          await writeHandLog(tx, pending);
          if (after !== before) {
            await tx.run(
              `INSERT INTO poker_runtime_state (id,state_json,updated_at) VALUES ('main',?,?)
               ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`,
              [after, new Date().toISOString()],
            );
          }
          return { result, pendingCount: pending.length };
        });
        confirmPokerHandLog(committed.pendingCount);
        return committed.result;
      } catch (error) {
        // Token buy-in/cash-out and the table snapshot are one transaction. Mark this shared queued runtime dirty:
        // both future callers and callers that already captured it must reload the last committed SQLite state.
        cached.invalidated = true;
        throw error;
      }
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
