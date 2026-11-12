export const CANONICAL_PUBLIC_APP_URL = 'https://2la-noire-chagina7x.waw0.amvera.tech';
export const DEFAULT_INTERNAL_BOT_SERVICE_URL = 'http://127.0.0.1:8081';

const normalizeBaseUrl = (value: unknown) => String(value || '').trim().replace(/\/+$/, '');

export const getBotServiceBaseUrl = () => normalizeBaseUrl(
  process.env.BOT_SERVICE_URL || DEFAULT_INTERNAL_BOT_SERVICE_URL,
);

export const getPublicAppBaseUrl = () => normalizeBaseUrl(
  process.env.PUBLIC_APP_URL
  || process.env.WEBHOOK_URL
  || process.env.RENDER_EXTERNAL_URL
  || CANONICAL_PUBLIC_APP_URL,
);

/**
 * The club's public site (owner, 2026-11-11: the welcome page moves to the site). `/welcome` of the app sends people there, the ready
 * messages link to it, and the app answers its requests from that address. `WELCOME_SITE_URL=off` keeps the app's own page.
 */
export const DEFAULT_WELCOME_SITE_URL = 'https://fainta7x.github.io/2la-noire-site/';
export const getWelcomeSiteUrl = (): string | null => {
  const raw = String(process.env.WELCOME_SITE_URL ?? DEFAULT_WELCOME_SITE_URL).trim();
  if (!raw || raw.toLowerCase() === 'off') return null;
  try { const url = new URL(raw); return url.protocol === 'https:' || url.hostname === 'localhost' ? `${url.origin}${url.pathname.replace(/\/*$/, '/')}` : null; } catch { return null; }
};
export const getWelcomeSiteOrigins = (): string[] => {
  const extra = String(process.env.WELCOME_SITE_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  const site = getWelcomeSiteUrl();
  return [...new Set([...(site ? [new URL(site).origin] : []), ...extra])];
};
/** Link to the sign-up on the site, with where the person came from. */
export const welcomeSiteLink = (source?: string | null): string | null => {
  const site = getWelcomeSiteUrl();
  if (!site) return null;
  return `${site}${source ? `?src=${encodeURIComponent(source)}` : ''}#join`;
};
