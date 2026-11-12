/**
 * «Войти» on the club's site sends the person to the app with `?return=<site address>`; after the sign-in the app sends them back
 * (owner, 2026-11-12: the site is the center). Only the club's own site is a valid return address, so the link cannot be used to
 * send people to another place.
 */
const KEY = 'site_return';
const ALLOWED_HOSTS = new Set(['2lamafia.ru', 'www.2lamafia.ru']);

export const parseSiteReturn = (raw: unknown): string | null => {
  try {
    const url = new URL(String(raw || ''));
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.username || url.password) return null;
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
};

/** Keeps the return address from the link until the sign-in is done (the login may go through another page and come back). */
export const rememberSiteReturn = (search: string, storage: Pick<Storage, 'setItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage) => {
  const value = parseSiteReturn(new URLSearchParams(search).get('return'));
  if (!value || !storage) return;
  try { storage.setItem(KEY, value); } catch { /* private mode: the return just does not happen */ }
};

/** The kept address, once; null when there is none. */
export const takeSiteReturn = (storage: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage): string | null => {
  if (!storage) return null;
  try {
    const value = parseSiteReturn(storage.getItem(KEY));
    storage.removeItem(KEY);
    return value;
  } catch { return null; }
};
