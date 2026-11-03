import { describe, expect, it } from 'vitest';
import {
  mayReceiveOtherRolePurchaseNotice,
  mayViewPurchasedRole,
  privateRoleAccess,
  privateRolePurchaseForActor,
} from '../lib/privateRolePurchaseAccess.ts';

const game = {
  judgePlayerId: 'judge',
  seats: [
    { seat: 1, playerId: 'owner', nickname: 'O', role: null },
    { seat: 2, playerId: 'guest', nickname: 'G', role: null },
  ],
};
const purchase = { id: 'p1', playerId: 'guest', role: 'sheriff', status: 'reserved' };

describe('private purchase administration versus notifications', () => {
  it('nonplaying organizer retains full admin access and can receive notices', () => {
    const actor = { playerId: 'admin', isOrganizer: true };
    expect(privateRoleAccess(game, actor)).toBe('all');
    expect(mayViewPurchasedRole(game, actor, 'guest')).toBe(true);
    expect(mayReceiveOtherRolePurchaseNotice(game, actor)).toBe(true);
  });
  it('playing organizer retains all access but receives no other-player purchase notifications', () => {
    const actor = { playerId: 'owner', isOrganizer: true };
    expect(privateRoleAccess(game, actor)).toBe('all');
    expect(mayViewPurchasedRole(game, actor, 'guest')).toBe(true);
    expect(privateRolePurchaseForActor(purchase, game, actor)).toMatchObject(purchase);
    expect(mayReceiveOtherRolePurchaseNotice(game, actor)).toBe(false);
  });
  it('assigned judge may receive purchases and ordinary players only see their own', () => {
    const judge = { playerId: 'judge', isOrganizer: false };
    expect(mayViewPurchasedRole(game, judge, 'guest')).toBe(true);
    expect(mayReceiveOtherRolePurchaseNotice(game, judge)).toBe(true);
    const guest = { playerId: 'guest', isOrganizer: false };
    expect(mayViewPurchasedRole(game, guest, 'guest')).toBe(true);
    expect(mayViewPurchasedRole(game, guest, 'owner')).toBe(false);
    expect(mayReceiveOtherRolePurchaseNotice(game, guest)).toBe(false);
  });
  it('unrelated players get no private purchases or notifications', () => {
    const outsider = { playerId: 'random', isOrganizer: false };
    expect(privateRoleAccess(game, outsider)).toBe('none');
    expect(privateRolePurchaseForActor(purchase, game, outsider)).toBeNull();
    expect(mayReceiveOtherRolePurchaseNotice(game, outsider)).toBe(false);
  });
  it('an unbound organizer session keeps admin access and is not mistakenly classified as playing', () => {
    const root = { playerId: null, isOrganizer: true };
    expect(privateRoleAccess(game, root)).toBe('all');
    expect(mayReceiveOtherRolePurchaseNotice(game, root)).toBe(true);
  });
});
