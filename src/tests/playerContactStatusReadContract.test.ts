import { describe, expect, it } from 'vitest';
import { deriveContactStatus, getCanInviteStatus } from '../lib/playerUtils.ts';

type StatusInput = { contact_status?: string | null; lifecycle_status?: string | null };

// Original byte-for-byte branch semantics from playerUtils and CRM read views.
// Kept in this golden test to prevent an accidental interpretation change.
const previousRead = (player: StatusInput): string =>
  player.contact_status || (player.lifecycle_status === 'blocked' ? 'blocked' : player.lifecycle_status === 'paused' ? 'paused' : 'normal');

describe('one player contact status compatibility reader', () => {
  it('matches the previous reader across new and historical states', () => {
    const stored = [undefined, null, '', 'normal', 'paused', 'blocked', 'custom', 'inactive'] as const;
    const legacy = [undefined, null, '', 'normal', 'paused', 'blocked', 'archived', 'inactive', 'lead'] as const;
    for (const contact_status of stored) {
      for (const lifecycle_status of legacy) {
        const input: StatusInput = { contact_status, lifecycle_status };
        expect(deriveContactStatus(input), JSON.stringify(input)).toBe(previousRead(input));
      }
    }
  });

  it('never treats a legacy engagement stage as a contact block', () => {
    expect(deriveContactStatus({ lifecycle_status: 'inactive' })).toBe('normal');
    expect(deriveContactStatus({ lifecycle_status: 'newcomer' })).toBe('normal');
    expect(deriveContactStatus({ lifecycle_status: 'regular' })).toBe('normal');
  });

  it('preserves stored contact status even if legacy lifecycle disagrees', () => {
    expect(deriveContactStatus({ contact_status: 'normal', lifecycle_status: 'blocked' })).toBe('normal');
    expect(deriveContactStatus({ contact_status: 'blocked', lifecycle_status: 'normal' })).toBe('blocked');
    expect(deriveContactStatus({ contact_status: '', lifecycle_status: 'paused' })).toBe('paused');
  });

  it('does not change a blocked, paused or temporarily excluded invitation decision', () => {
    const now = new Date('2026-10-12T09:00:00.000Z');
    expect(getCanInviteStatus({ lifecycle_status: 'blocked' }, now)).toEqual({
      canInvite: false, reason: 'Игрок заблокирован',
    });
    expect(getCanInviteStatus({ lifecycle_status: 'paused' }, now)).toEqual({
      canInvite: false, reason: 'Контакт на паузе',
    });
    expect(getCanInviteStatus({
      contact_status: 'normal',
      do_not_invite_until: '2026-10-13T09:00:00.000Z',
    }, now)).toMatchObject({ canInvite: false });
    expect(getCanInviteStatus({
      contact_status: 'normal',
      do_not_invite_until: '2026-10-11T09:00:00.000Z',
    }, now)).toEqual({ canInvite: true, reason: 'Можно приглашать' });
  });
});
