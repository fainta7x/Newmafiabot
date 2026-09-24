import type { LiveSnapshot } from './engineStateModel.js';
import { isSupportedTableSize } from '../../lib/tableComposition.ts';

export const LIVE_GAME_SESSION_STORAGE_KEY = 'mafia_live_session';

export type PersistedLiveSession = LiveSnapshot & {
  historyStack?: LiveSnapshot[];
  savedAt?: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const browserStorage = (): StorageLike => localStorage;

export function readRestorableLiveSession(
  storage: StorageLike = browserStorage(),
): PersistedLiveSession | null {
  try {
    const raw = storage.getItem(LIVE_GAME_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedLiveSession;
    if (parsed?.phase && parsed.phase !== 'setup' && isSupportedTableSize(Number(parsed.activePlayers?.length))) {
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
