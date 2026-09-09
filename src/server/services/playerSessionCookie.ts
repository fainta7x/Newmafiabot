import type { Response } from 'express';
import { generatePlayerSessionToken } from '../auth.ts';

const PLAYER_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type PlayerSessionCookieOptions = {
  crossSiteWebView?: boolean;
};

export function setPlayerSessionCookie(
  res: Response,
  playerId: string,
  options: PlayerSessionCookieOptions = {},
): void {
  const production = process.env.NODE_ENV === 'production';
  res.cookie('player_token', generatePlayerSessionToken(String(playerId)), {
    httpOnly: true,
    secure: production,
    // A VK-issued cabinet session may run inside a VK-owned embedded WebView,
    // where SameSite=Lax cookies are not guaranteed to accompany later API calls.
    // Keep the normal cookie Lax and opt in only for the VK authentication path.
    sameSite: production && options.crossSiteWebView ? 'none' : 'lax',
    path: '/',
    maxAge: PLAYER_SESSION_MAX_AGE_MS,
  });
}
