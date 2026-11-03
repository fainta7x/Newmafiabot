import type { Game } from '../shared/game.ts';

/**
 * Administrative access and proactive purchase notifications are independent.
 * A club organizer keeps full management and transaction permissions even
 * while playing. Never infer permissions from notification eligibility.
 */
export type PrivateRoleActor = {
  playerId: string | null;
  isOrganizer: boolean;
};

export type PrivateRoleAccess = 'all' | 'own' | 'none';

export function privateRoleAccess(game: Pick<Game, 'judgePlayerId' | 'seats'>, actor: PrivateRoleActor): PrivateRoleAccess {
  if (actor.isOrganizer) return 'all';
  if (actor.playerId && game.judgePlayerId === actor.playerId) return 'all';
  if (actor.playerId && game.seats.some((seat) => seat.playerId === actor.playerId)) return 'own';
  return 'none';
}

/**
 * A playing organizer must receive no proactive information about other
 * players' purchases, despite retaining access to the management panel.
 * The game's judge may receive notices even when otherwise associated with
 * the game; ordinary players must never receive notices about other buyers.
 */
export function mayReceiveOtherRolePurchaseNotice(
  game: Pick<Game, 'judgePlayerId' | 'seats'>,
  actor: PrivateRoleActor,
): boolean {
  if (actor.playerId && game.judgePlayerId === actor.playerId) return true;
  if (!actor.isOrganizer) return false;
  if (!actor.playerId) return true;
  return !game.seats.some((seat) => seat.playerId === actor.playerId);
}

export function mayViewPurchasedRole(
  game: Pick<Game, 'judgePlayerId' | 'seats'>,
  actor: PrivateRoleActor,
  buyerPlayerId: string,
): boolean {
  const level = privateRoleAccess(game, actor);
  return level === 'all' || (level === 'own' && actor.playerId === buyerPlayerId);
}

/** Explicit admin lookup, never a push notification payload or player catalogue. */
export function privateRolePurchaseForActor<T extends { playerId: string; role: string }>(
  purchase: T,
  game: Pick<Game, 'judgePlayerId' | 'seats'>,
  actor: PrivateRoleActor,
): T | null {
  return mayViewPurchasedRole(game, actor, purchase.playerId) ? { ...purchase } : null;
}
