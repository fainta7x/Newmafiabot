import type { Game } from '../shared/game.ts';

/**
 * Access to private role purchases is determined by participation in this
 * specific game, not merely by club-wide organizer privileges.
 * The route must resolve actor identity from verified sessions, never from a
 * playerId field supplied by the browser.
 */
export type PrivateRoleActor = {
  playerId: string | null;
  isOrganizer: boolean;
};

export type PrivateRoleAccess = 'all' | 'own' | 'none';

/**
 * In the game -> non-playing organizer can manage/view all purchases.
 * At the table -> even the club organizer cannot inspect other players'
 * purchased roles. A designated judge sees them as part of the deal.
 */
export function privateRoleAccess(game: Pick<Game, 'judgePlayerId' | 'seats'>, actor: PrivateRoleActor): PrivateRoleAccess {
  const playerId = actor.playerId;
  if (playerId && game.judgePlayerId === playerId) return 'all';
  const participates = Boolean(playerId && game.seats.some((seat) => seat.playerId === playerId));
  if (participates) return 'own';
  if (actor.isOrganizer) return 'all';
  return 'none';
}

export function mayViewPurchasedRole(
  game: Pick<Game, 'judgePlayerId' | 'seats'>,
  actor: PrivateRoleActor,
  buyerPlayerId: string,
): boolean {
  const level = privateRoleAccess(game, actor);
  return level === 'all' || (level === 'own' && actor.playerId === buyerPlayerId);
}

/** Organizer's cancellation authority never implies access to a role field. */
export function privateRolePurchaseForActor<T extends { playerId: string; role: string }>(
  purchase: T,
  game: Pick<Game, 'judgePlayerId' | 'seats'>,
  actor: PrivateRoleActor,
): Omit<T, 'role'> & { role?: string } | null {
  const level = privateRoleAccess(game, actor);
  if (level === 'none') return null;
  if (level === 'all' || actor.playerId === purchase.playerId) return { ...purchase };
  // Even existence or metadata of another player's purchase is private.
  return null;
}
