import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import { getClubAppUrl, getPublicAppBaseUrl } from '../runtimeConfig.ts';

const originOf = (value: string | undefined): string | null => {
  try { return value ? new URL(value).origin : null; } catch { return null; }
};

/** Cookie credentials are ambient in a browser; API/bot bearer credentials are not. */
export const cookieCsrfProtection: RequestHandler = (req, res, next) => {
  // Welcome writes use an explicit guest bearer token or no authentication at
  // all, never the ambient player/organizer cookies. Their own CORS still applies.
  if (req.path === '/api/public/welcome' || req.path.startsWith('/api/public/welcome/')) return next();
  const cookieAuth = Boolean(req.cookies?.organizer_token || req.cookies?.player_token);
  if (!cookieAuth) return next();

  const providedToken = req.get('X-CSRF-Token');
  const tokenMatches = typeof providedToken === 'string' && /^[a-f0-9]{64}$/.test(providedToken)
    && providedToken === req.cookies.csrf_token;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !tokenMatches) {
    const trusted = new Set([
      originOf(`${req.protocol}://${req.get('host')}`),
      originOf(getClubAppUrl()),
      originOf(getPublicAppBaseUrl()),
    ].filter(Boolean));
    const origin = req.get('Origin');
    const fetchSite = req.get('Sec-Fetch-Site');
    const referer = req.get('Referer');
    // An explicit Origin takes precedence over weaker or contradictory metadata.
    const allowed = origin !== undefined ? trusted.has(originOf(origin))
      : fetchSite !== undefined ? fetchSite === 'same-origin'
      : referer !== undefined ? trusted.has(originOf(referer))
      // Signed bot/admin HTTP clients have no browser metadata. Keep that API path.
      : true;
    if (!allowed) return res.status(403).json({ error: 'Запрос с другого сайта отклонён. Обнови страницу приложения.' });
  }

  if (typeof req.cookies.csrf_token !== 'string' || !/^[a-f0-9]{64}$/.test(req.cookies.csrf_token)) {
    res.cookie('csrf_token', randomBytes(32).toString('hex'), {
      path: '/', sameSite: 'lax', secure: req.secure, httpOnly: false, maxAge: 86400_000,
    });
  }
  return next();
};
