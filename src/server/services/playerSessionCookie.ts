import type { Response } from 'express';
import { generatePlayerSessionToken } from '../auth.ts';

const PLAYER_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function setPlayerSessionCookie(res: Response, playerId: string): void {
  res.cookie('player_token', generatePlayerSessionToken(String(playerId)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PLAYER_SESSION_MAX_AGE_MS,
  });
}
