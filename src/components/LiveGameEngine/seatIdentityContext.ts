import { createContext, type ReactNode } from 'react';

/**
 * The avatar and the nickname of a seat live inside its card (owner, 2026-11-02: «переделывай всё, чтобы больше никогда не мучаться»):
 * the card is one grid, so its parts cannot overlap. The evening Live game supplies how a seat's identity looks; with no provider
 * (tournament, training) the card keeps its old shape and the old identity layer.
 */
export const SeatIdentityContext = createContext<((slot: number) => ReactNode) | null>(null);
