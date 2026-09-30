/*
 * 2LA Noire service worker (owner, 2026-09-30): while the server restarts, the hosting answers 502/503
 * or nothing at all. Pages then fall back to the last good app shell (it shows «Приложение
 * перезапускается» by itself), or, on a first visit, to a small note with the organizer's contacts.
 * API calls are never cached or answered here.
 */
const CACHE = 'noire-shell-v1';
const SHELL = '/__shell';
const TIMEOUT_MS = 8000;

const MAINTENANCE_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>2LA Noire — перезапуск</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#090a0d;color:#fff;font:15px/1.5 system-ui,-apple-system,sans-serif;padding:20px;box-sizing:border-box}
main{max-width:390px;width:100%;border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:22px;background:rgba(255,255,255,.045)}
small{letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.4)}h1{font-size:22px;margin:10px 0 8px}p{color:rgba(255,255,255,.65);margin:0 0 14px}
a{display:block;min-height:44px;line-height:44px;margin-top:8px;border-radius:14px;text-align:center;color:#fff;background:rgba(255,255,255,.08);text-decoration:none;font-weight:600}
button{width:100%;min-height:48px;border:0;border-radius:14px;background:#fff;color:#000;font-weight:700;font-size:15px;margin-top:6px}</style></head>
<body><main><small>2LA Noire</small><h1>Приложение перезапускается</h1>
<p>Администратор обновляет приложение — обычно это занимает до 5 минут. Попробуйте зайти чуть позже, страница обновится сама.</p>
<button onclick="location.reload()">Попробовать снова</button>
<p style="margin:16px 0 0">По всем вопросам пишите организатору:</p>
<a href="https://t.me/Chagina7x">Telegram @Chagina7x</a><a href="https://vk.com/m1kesh1noda">VK</a>
</main><script>setTimeout(function(){location.reload()},30000)</script></body></html>`;

const maintenance = () => new Response(MAINTENANCE_HTML, {
  status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '60' },
});

const withTimeout = (promise) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});

self.addEventListener('install', (event) => {
  // The note is also served by nginx when the web process restarts inside the container.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/maintenance.html')).catch(() => undefined).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const isRestarting = (response) => response.status === 502 || response.status === 503 || response.status === 504;

async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request));
    const html = (response.headers.get('Content-Type') || '').includes('text/html');
    if (response.ok && html) {
      await cache.put(SHELL, response.clone());
      return response;
    }
    if (!isRestarting(response)) return response;
  } catch {
    // No answer at all: the server is restarting.
  }
  // Only the player app knows how to show the restart note itself; links such as /e/… or /join/… get the note page.
  const path = new URL(request.url).pathname;
  if (path === '/' || path === '/player' || path.startsWith('/player/')) return (await cache.match(SHELL)) || maintenance();
  return maintenance();
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    // Old builds pile up after deploys: keep only the newest files.
    const keys = (await cache.keys()).filter((key) => new URL(key.url).pathname.startsWith('/assets/'));
    for (const key of keys.slice(0, Math.max(0, keys.length - 80))) await cache.delete(key);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Server routes (sign-in callbacks, the bot webhook, the old CRM) always go straight to the server.
  if (url.pathname.startsWith('/api') || url.pathname === '/webhook' || url.pathname.startsWith('/crm/')) return;
  if (request.mode === 'navigate') { event.respondWith(page(request)); return; }
  // Hashed build files never change, so a cached copy is always right.
  if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request));
});
