import type { GameRole } from '../shared/gameRoles.ts';
import { isSupportedTableSize, tableRoleCounts } from './tableComposition.ts';

/**
 * Private reservation decision, without HTTP responses or billing side effects.
 * Callers must serialize this decision with the persisted writes in one transaction.
 * No result from this module may be exposed to other players or to an unrelated judge.
 */
export type RoleReservation = {
  id: string;
  gameId: number;
  eveningId: string;
  playerId: string;
  role: GameRole;
  status: 'reserved' | 'deferred' | 'cancelled' | 'fulfilled';
  createdAt: string;
};

export type RoleReservationDecision =
  | { status: 'reserved'; gameId: number; role: GameRole }
  | { status: 'deferred'; gameId: number; role: GameRole };

export function decideRoleReservation(input: {
  gameId: number;
  tableSize: number;
  format: string;
  playerId: string;
  role: GameRole;
  reservations: readonly RoleReservation[];
  dealStarted: boolean;
}): RoleReservationDecision {
  const { gameId, tableSize, format, playerId, role, reservations, dealStarted } = input;
  if (!Number.isInteger(gameId) || gameId < 1) throw new Error('Invalid game');
  if (!isSupportedTableSize(tableSize)) throw new Error('Unsupported table size');
  if (format !== 'CASUAL' && format !== 'NOVICE') throw new Error('Role purchases not allowed for this format');
  if (!playerId) throw new Error('Player identity required');
  if (dealStarted) throw new Error('Role purchasing closed when dealing starts');
  const capacity = tableRoleCounts(tableSize)[role];
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid role');

  // A seat cannot be promised two roles in the same game. Repeated requests must
  // be handled idempotently by the caller, never as a second charge.
  const existing = reservations.find((item) =>
    item.gameId === gameId && item.playerId === playerId &&
    (item.status === 'reserved' || item.status === 'fulfilled'),
  );
  if (existing) throw new Error('Player already has a role reservation for this game');

  const reservedCount = reservations.filter((item) =>
    item.gameId === gameId && item.role === role &&
    (item.status === 'reserved' || item.status === 'fulfilled'),
  ).length;
  return reservedCount < capacity
    ? { status: 'reserved', gameId, role }
    : { status: 'deferred', gameId, role };
}

/**
 * Only for the buyer's private order details and the specifically assigned
 * game's judge. A public catalogue must never depend on this state.
 */
export function roleReservationOwnerView(item: RoleReservation) {
  return {
    id: item.id,
    gameId: item.gameId,
    role: item.role,
    status: item.status,
  };
}

/** Cancellation frees a card. Billing reversal is a separate, atomic ledger action. */
export function cancelRoleReservation(item: RoleReservation): RoleReservation {
  if (item.status === 'fulfilled') throw new Error('Already fulfilled');
  return { ...item, status: 'cancelled' };
}

/** At evening close only unfulfilled orders are cancelled. */
export function cancelUnfulfilledEveningRoleReservations(
  reservations: readonly RoleReservation[],
  eveningId: string,
): RoleReservation[] {
  return reservations.map((item) =>
    item.eveningId === eveningId &&
    (item.status === 'reserved' || item.status === 'deferred')
      ? { ...item, status: 'cancelled' }
      : item,
  );
}
