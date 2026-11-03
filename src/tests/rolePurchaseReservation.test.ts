import { describe, expect, it } from 'vitest';
import {
  cancelRoleReservation,
  cancelUnfulfilledEveningRoleReservations,
  decideRoleReservation,
  type RoleReservation,
} from '../lib/rolePurchaseReservation.ts';

const make = (id: string, role: RoleReservation['role'], status: RoleReservation['status'] = 'reserved'): RoleReservation =>
  ({ id, role, status, gameId: 10, eveningId: 'friday', playerId: id, createdAt: '2026-11-03T00:00:00Z' });
const request = (reservations: RoleReservation[], role: RoleReservation['role'], playerId: string) =>
  decideRoleReservation({ gameId: 10, tableSize: 10, format: 'CASUAL', playerId, role, reservations, dealStarted: false });

describe('private pre-deal role reservation decisions', () => {
  it('first sheriff gets the unique card; another request is deferred without changing that reservation', () => {
    expect(request([], 'sheriff', 'a').status).toBe('reserved');
    expect(request([make('a', 'sheriff')], 'sheriff', 'b').status).toBe('deferred');
  });
  it('respects two mafia cards and six citizen cards', () => {
    expect(request([make('a', 'mafia')], 'mafia', 'b').status).toBe('reserved');
    expect(request([make('a', 'mafia'), make('b', 'mafia')], 'mafia', 'c').status).toBe('deferred');
    const sixCitizens = Array.from({ length: 6 }, (_, i) => make('p' + i, 'citizen'));
    expect(request(sixCitizens.slice(0, 5), 'citizen', 'last').status).toBe('reserved');
    expect(request(sixCitizens, 'citizen', 'extra').status).toBe('deferred');
  });
  it('rejects role purchases once dealing begins, and in rating/tournament formats', () => {
    for (const format of ['RATING', 'TOURNAMENT']) {
      expect(() => decideRoleReservation({ gameId: 10, tableSize: 10, format, playerId: 'a', role: 'sheriff', reservations: [], dealStarted: false })).toThrow();
    }
    expect(() => decideRoleReservation({ gameId: 10, tableSize: 10, format: 'CASUAL', playerId: 'a', role: 'sheriff', reservations: [], dealStarted: true })).toThrow();
  });
  it('does not allow duplicate paid roles for one player and game', () => {
    expect(() => request([make('a', 'don')], 'sheriff', 'a')).toThrow(/already/);
  });
  it('cancellation releases the card, while fulfilled roles cannot be cancelled', () => {
    const cancelled = cancelRoleReservation(make('a', 'sheriff'));
    expect(request([cancelled], 'sheriff', 'b').status).toBe('reserved');
    expect(() => cancelRoleReservation(make('a', 'sheriff', 'fulfilled'))).toThrow();
  });
  it('evening close cancels unresolved requests without changing fulfilled or other-evening purchases', () => {
    const another = { ...make('x', 'don'), eveningId: 'other' };
    const result = cancelUnfulfilledEveningRoleReservations(
      [make('a', 'sheriff'), make('b', 'don', 'deferred'), make('c', 'mafia', 'fulfilled'), another], 'friday',
    );
    expect(result.map((item) => item.status)).toEqual(['cancelled', 'cancelled', 'fulfilled', 'reserved']);
  });
});
