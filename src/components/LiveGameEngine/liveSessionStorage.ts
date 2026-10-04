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

/**
 * Club evening sessions are already scoped to their game by the club recorder (it swaps the shared key per game), so a club
 * session saved before the key existed is still offered to its own game. Other games need an exact match.
 */
const sessionKeyMatches = (stored: string | undefined, expected: string | undefined) => {
  if ((stored || undefined) === (expected || undefined)) return true;
  return Boolean(expected?.startsWith('club:') && !stored);
};

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
    if (parsed?.phase && parsed.phase !== 'setup' && isSupportedTableSize(size) && (expectedTableSize === undefined || size === expectedTableSize) && sessionKeyMatches(parsed.sessionKey, expectedSessionKey)) {
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
