import { createContext } from 'react';

/**
 * Who sits on a seat, for the role deal's avatars (owner-approved deal design, 2026-11-03). The live engine only knows the
 * seat and the nickname; the game window that knows the players (club or tournament) provides this. Without a provider the
 * deal shows the default avatar.
 */
export const DealSeatPlayersContext = createContext<((seat: number) => string | null) | null>(null);
