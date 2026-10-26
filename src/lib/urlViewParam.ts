/**
 * A view inside a screen that has no route of its own is kept in the address query (owner, 2026-10-18: a reload must lead
 * back to the same place). Reading ignores anything not in `allowed`; writing replaces the current history entry, so
 * switching tabs does not fill the back button, and keeps the path and the other parameters.
 */
export const readViewParam = <T extends string>(key: string, allowed: readonly T[]): T | null => {
  try {
    const value = new URLSearchParams(window.location.search).get(key);
    return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
  } catch {
    return null;
  }
};

export const writeViewParam = (key: string, value: string | null): void => {
  try {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', next);
    }
  } catch {
    /* a convenience only */
  }
};
