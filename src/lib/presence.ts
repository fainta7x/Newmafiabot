/**
 * «Сейчас в приложении» (owner, 2026-09-30): while the app is on the display, it tells the server which
 * screen is open, every PRESENCE_MS. Only the club owner sees the list; nothing is shown to the player.
 * Public pages (sign-up links, broadcast overlays, the OBS bridge) do not report.
 */
const PRESENCE_MS = 15_000;
let installed = false;

const report = () => {
  if (document.visibilityState !== 'visible') return;
  const path = window.location.pathname;
  if (!(path === '/' || path.startsWith('/player') || path.startsWith('/admin'))) return;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch('/api/presence', { method: 'POST', headers, credentials: 'include', body: JSON.stringify({ screen: path }), keepalive: true }).catch(() => undefined);
  } catch {
    // Presence must never affect the app.
  }
};

export function installPresence() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.setInterval(report, PRESENCE_MS);
  window.addEventListener('popstate', report);
  document.addEventListener('visibilitychange', report);
  report();
}
