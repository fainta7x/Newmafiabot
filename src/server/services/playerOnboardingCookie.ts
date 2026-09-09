import type { Response } from 'express';

export const PLAYER_ONBOARDING_COOKIE = 'player_onboarding';
const MAX_AGE_MS = 20 * 60 * 1000;

export function setPlayerOnboardingCookie(res: Response, token: string) {
  res.cookie(PLAYER_ONBOARDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_MS,
  });
}

export function clearPlayerOnboardingCookie(res: Response) {
  res.clearCookie(PLAYER_ONBOARDING_COOKIE, { path: '/' });
}
