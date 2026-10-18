// Device storage of a live game (owner report 2026-10-18: after several games of one evening the death-protocol window
// stopped opening). The replay frames of the OBS presentation (`mafia_live_broadcast_frames:<game>`, up to 360 frames of
// about 2.4 KB each) were never removed, so after a few games the browser's storage was full and the engine's session
// (the death-protocol window and recovery read it) silently stopped being written. The frames are a convenience for
// replay, the live game is not: when storage is full the frames give way.

export const REPLAY_FRAMES_KEY_PREFIX = 'mafia_live_broadcast_frames:';
export const replayFramesKey = (gameId: number | string): string => `${REPLAY_FRAMES_KEY_PREFIX}${gameId}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const browserStorage = (): StorageLike | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

/** Removes the replay frames of every game except `keepGameId`; with no id, of all games. Returns how many keys went. */
export function evictReplayFrames(keepGameId: number | string | null = null, storage: StorageLike | null = browserStorage()): number {
  if (!storage) return 0;
  const keep = keepGameId === null ? null : replayFramesKey(keepGameId);
  const doomed: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(REPLAY_FRAMES_KEY_PREFIX) && key !== keep) doomed.push(key);
    }
    doomed.forEach((key) => storage.removeItem(key));
  } catch { /* nothing more can be done */ }
  return doomed.length;
}

/**
 * setItem that makes room when the storage is full: first the replay frames of other games go, then the frames of the
 * current game. Returns false only when even that did not help.
 */
export function setItemFreeingSpace(key: string, value: string, keepGameId: number | string | null = null, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try { storage.setItem(key, value); return true; } catch { /* full: make room */ }
  evictReplayFrames(keepGameId, storage);
  try { storage.setItem(key, value); return true; } catch { /* still full */ }
  if (keepGameId !== null) evictReplayFrames(null, storage);
  try { storage.setItem(key, value); return true; } catch { return false; }
}
