/**
 * «Экраны без подгрузки» (owner, 2026-11-17): the last data of a screen is kept on the device, so after a reload the
 * screen shows at once and is refreshed in the background. Cleared on logout and when the server refuses access.
 * The storage may be unavailable (private mode, blocked site data) — then everything works as before, with a loader.
 */
const PREFIX = 'screen-cache:v1:';
/** Older data is not shown: after a long break a loader is more honest than a week-old screen. */
export const SCREEN_CACHE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export function readScreenCache<T>(key: string, now = Date.now()): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { at?: number; value?: T };
    if (typeof stored?.at !== 'number' || now - stored.at > SCREEN_CACHE_MAX_AGE_MS || stored.value == null) return null;
    return stored.value;
  } catch {
    return null;
  }
}

export function writeScreenCache(key: string, value: unknown) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Full or blocked storage: the screen just loads as before next time.
  }
}

/** Removes every kept screen (logout, access refused). */
export function clearScreenCache(prefix = '') {
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(PREFIX + prefix)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // Nothing kept or storage blocked.
  }
}
