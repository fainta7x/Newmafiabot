import { describe, expect, it } from 'vitest';
import { mayViewPurchasedRole, privateRoleAccess, privateRolePurchaseForActor } from '../lib/privateRolePurchaseAccess.ts';
const game = { judgePlayerId: 'judge', seats: [{ seat: 1, playerId: 'owner', nickname: 'O', role: null }, { seat: 2, playerId: 'guest', nickname: 'G', role: null }] };
const purchase = { id: 'p1', playerId: 'guest', role: 'sheriff', status: 'reserved' };
describe('private role purchase visibility by game participation', () => {
  it('non-playing organizer can inspect purchases', () => {
    const actor = { playerId: 'admin', isOrganizer: true };
    expect(privateRoleAccess(game, actor)).toBe('all');
    expect(mayViewPurchasedRole(game, actor, 'guest')).toBe(true);
  });
  it('playing organizer cannot see other player\'s purchase', () => {
    const actor = { playerId: 'owner', isOrganizer: true };
    expect(privateRoleAccess(game, actor)).toBe('own');
    expect(mayViewPurchasedRole(game, actor, 'guest')).toBe(false);
    expect(privateRolePurchaseForActor(purchase, game, actor)).toMatchObject({ id: 'p1', playerId: 'guest' });
    expect(privateRolePurchaseForActor(purchase, game, actor)).not.toHaveProperty('role');
  });
  it('a judge of the game sees all; another player sees only own role', () => {
    expect(mayViewPurchasedRole(game, { playerId: 'judge', isOrganizer: false }, 'guest')).toBe(true);
    expect(mayViewPurchasedRole(game, { playerId: 'guest', isOrganizer: false }, 'guest')).toBe(true);
    expect(mayViewPurchasedRole(game, { playerId: 'guest', isOrganizer: false }, 'owner')).toBe(false);
  });
  it('unrelated ordinary users get no private purchase data', () => {
    expect(privateRoleAccess(game, { playerId: 'random', isOrganizer: false })).toBe('none');
    expect(privateRolePurchaseForActor(purchase, game, { playerId: 'random', isOrganizer: false })).toBeNull();
  });
});
