/**
 * Anonymous usage tracking: which screens are opened and which buttons are
 * pressed. Screens come from the URL (ids replaced by `:id`); actions come only
 * from `data-track` or `data-testid` on the pressed control, never from its
 * text, so no names or personal data leave the device.
 */
type UiEvent = { kind: 'screen' | 'action'; name: string; at: string };
type Surface = 'player' | 'crm' | 'public';

const ENDPOINT = '/api/ui-events';
const FLUSH_MS = 5000;
const MAX_QUEUE = 20;
const ID_SEGMENT = /^(?=.*\d)[0-9a-z_-]{6,}$/i;

let queue: UiEvent[] = [];
let queueSurface: Surface | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastScreen = '';
let sessionKey = '';
let installed = false;

const randomKey = () => {
  try { if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID(); } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const getSessionKey = () => {
  if (sessionKey) return sessionKey;
  try {
    sessionKey = sessionStorage.getItem('ui_session_key') || '';
    if (!sessionKey) { sessionKey = randomKey(); sessionStorage.setItem('ui_session_key', sessionKey); }
  } catch {
    sessionKey = sessionKey || randomKey();
  }
  return sessionKey;
};

export const surfaceForPath = (path: string): Surface =>
  path.startsWith('/admin') ? 'crm' : path.startsWith('/player') ? 'player' : 'public';

/** `/admin/evenings/385404e7-…/games` → `/admin/evenings/:id/games`. */
export const normalizeScreenPath = (path: string) => {
  const clean = (path.split(/[?#]/)[0] || '/').toLowerCase();
  const segments = clean.split('/').filter(Boolean).slice(0, 5).map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment));
  return `/${segments.join('/')}`.replace(/[^a-z0-9/:_.-]/g, '').slice(0, 80) || '/';
};

const actionName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9/:_.-]+/g, '-').slice(0, 80);

const flush = (useBeacon = false) => {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!queue.length || !queueSurface) return;
  const payload = JSON.stringify({ session: getSessionKey(), surface: queueSurface, events: queue });
  queue = [];
  try {
    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      // sendBeacon carries cookies (player session); organizer bearer-only sessions fall back to fetch.
      if (!localStorage.getItem('organizer_token') && navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }))) return;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(ENDPOINT, { method: 'POST', headers, body: payload, credentials: 'include', keepalive: true }).catch(() => undefined);
  } catch {
    // Usage tracking must never affect the app.
  }
};

const push = (event: Omit<UiEvent, 'at'>, surface: Surface) => {
  if (queueSurface && queueSurface !== surface) flush();
  queueSurface = surface;
  queue.push({ ...event, at: new Date().toISOString() });
  if (queue.length >= MAX_QUEUE) flush();
  else if (!flushTimer) flushTimer = setTimeout(() => flush(), FLUSH_MS);
};

export const trackScreen = (path = window.location.pathname) => {
  const name = normalizeScreenPath(path);
  if (name === lastScreen) return;
  lastScreen = name;
  push({ kind: 'screen', name }, surfaceForPath(path));
};

export const trackAction = (name: string) => {
  const safe = actionName(name);
  if (safe) push({ kind: 'action', name: safe }, surfaceForPath(window.location.pathname));
};

export function installUiTelemetry() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function patched(this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      trackScreen();
      return result;
    } as History['pushState'];
  }
  window.addEventListener('popstate', () => trackScreen());
  document.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest?.('[data-track], button[data-testid], a[data-testid], [role="button"][data-testid]');
    const name = target?.getAttribute('data-track') || target?.getAttribute('data-testid');
    if (name) trackAction(name);
  }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  window.addEventListener('pagehide', () => flush(true));
  trackScreen();
}
