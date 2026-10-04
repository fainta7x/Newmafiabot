import type { LiveSnapshot } from './engineStateModel.js';
import { isSupportedTableSize } from '../../lib/tableComposition.ts';

export const LIVE_GAME_SESSION_STORAGE_KEY = 'mafia_live_session';

export type PersistedLiveSession = LiveSnapshot & {
  historyStack?: LiveSnapshot[];
  savedAt?: string;
  /** The game this session belongs to; absent for sessions saved before the key existed. */
  sessionKey?: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const browserStorage = (): StorageLike => localStorage;

export function readRestorableLiveSession(
  storage: StorageLike = browserStorage(),
  /** Seats of the game being opened: a stored game of another table size is never offered. */
  expectedTableSize?: number,
  /** The game being opened. With a key only that game's session is offered; without one only a keyless session is. */
  expectedSessionKey?: string,
): PersistedLiveSession | null {
  try {
    const raw = storage.getItem(LIVE_GAME_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedLiveSession;
    const size = Number(parsed?.activePlayers?.length);
    if (parsed?.phase && parsed.phase !== 'setup' && isSupportedTableSize(size) && (expectedTableSize === undefined || size === expectedTableSize) && (parsed.sessionKey || undefined) === (expectedSessionKey || undefined)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function writeLiveSession(
  session: PersistedLiveSession,
  storage: StorageLike = browserStorage(),
): void {
  try {
    storage.setItem(LIVE_GAME_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Recovery persistence is best-effort and must never interrupt the live game.
  }
}

export function removeLiveSession(storage: StorageLike = browserStorage()): void {
  storage.removeItem(LIVE_GAME_SESSION_STORAGE_KEY);
}
