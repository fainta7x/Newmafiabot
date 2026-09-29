import type { DatabaseWrapper } from '../../db/index.ts';
import { vkPublisherApi } from './vkPublishingService.ts';

/**
 * Short links for announcement posts (owner feedback 2026-09-29: the full app links looked long and scary).
 * A link goes through the VK shortener (vk.cc) once and is remembered, so the post text stays the same
 * between syncs. Without VK access the app's own short path is used instead: /e/<code> for an evening.
 */

const normalizeBaseUrl = (value: string) => String(value || '').trim().replace(/\/+$/, '');

/** The first 8 characters of an evening id: enough to tell the club's evenings apart. */
export const eveningShortCode = (eveningId: string) => String(eveningId || '').slice(0, 8).toLowerCase();

export const eveningShortPath = (eveningId: string) => `/e/${encodeURIComponent(eveningShortCode(eveningId))}`;

async function ensureShortLinkSchema(db: DatabaseWrapper) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_short_links (
      long_url TEXT PRIMARY KEY,
      short_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

// After VK refuses to shorten, wait before asking again instead of calling it on every post sync.
const SHORTENER_PAUSE_MS = 60 * 60 * 1000;
let shortenerPausedUntil = 0;

// Tests stub VK calls one by one; they turn the shortener on explicitly (VK_SHORT_LINKS=on).
const shortenerEnabled = () => {
  const flag = String(process.env.VK_SHORT_LINKS || '').trim().toLowerCase();
  if (flag === 'off') return false;
  return flag === 'on' || process.env.NODE_ENV !== 'test';
};

export const resetShortLinkPauseForTests = () => { shortenerPausedUntil = 0; };

/** The vk.cc link for a URL, remembered after the first call; null when VK cannot shorten it. */
async function vkShortLink(db: DatabaseWrapper, longUrl: string): Promise<string | null> {
  if (!shortenerEnabled()) return null;
  try {
    await ensureShortLinkSchema(db);
    const saved = await db.get<{ short_url: string }>('SELECT short_url FROM announcement_short_links WHERE long_url = ?', [longUrl]);
    if (saved?.short_url) return saved.short_url;
    if (Date.now() < shortenerPausedUntil) return null;
    const result = await vkPublisherApi<{ short_url?: string }>('utils.getShortLink', { url: longUrl, private: 0 });
    const shortUrl = String(result?.short_url || '').trim();
    if (!/^https:\/\/vk\.cc\/[A-Za-z0-9]+$/.test(shortUrl)) {
      shortenerPausedUntil = Date.now() + SHORTENER_PAUSE_MS;
      return null;
    }
    await db.run(
      'INSERT OR IGNORE INTO announcement_short_links (long_url, short_url, created_at) VALUES (?, ?, ?)',
      [longUrl, shortUrl, new Date().toISOString()],
    );
    return shortUrl;
  } catch {
    shortenerPausedUntil = Date.now() + SHORTENER_PAUSE_MS;
    return null;
  }
}

export async function shortEveningLink(db: DatabaseWrapper, baseUrl: string, eveningId: string): Promise<string> {
  const own = `${normalizeBaseUrl(baseUrl)}${eveningShortPath(eveningId)}`;
  return (await vkShortLink(db, own)) || own;
}

export async function shortCabinetLink(db: DatabaseWrapper, baseUrl: string): Promise<string> {
  const own = `${normalizeBaseUrl(baseUrl)}/player`;
  return (await vkShortLink(db, own)) || own;
}

/** The evening a short code points to, or null when none or several evenings match. */
export async function resolveEveningShortCode(db: DatabaseWrapper, code: string): Promise<string | null> {
  const value = String(code || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,64}$/.test(value)) return null;
  const rows = await db.all<{ id: string }>(
    "SELECT id FROM game_evenings WHERE lower(substr(id, 1, ?)) = ? AND status <> 'cancelled' LIMIT 2",
    [value.length, value],
  );
  return rows.length === 1 ? String(rows[0].id) : null;
}
