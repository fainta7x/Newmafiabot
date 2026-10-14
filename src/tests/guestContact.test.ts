import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { createGuestPlaceholder, listGuestPlaceholdersForEvening, normalizeGuestContact, updateGuestPlaceholder } from '../server/services/guestPlayerService.ts';
import { guestContactHref } from '../lib/guestContact.ts';

let db: DatabaseWrapper;
beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  const now = new Date().toISOString();
  await db.run("INSERT INTO game_evenings (id,title,starts_at,status,default_price,created_at,updated_at) VALUES ('e1','Вечер',?, 'published',400,?,?)", [now, now, now]);
});
afterEach(() => { try { db.sqlite.close(); } catch {} });

describe('guest pre-registration with a contact', () => {
  it('signs a guest up as going and keeps how to reach them', async () => {
    const guest = await createGuestPlaceholder(db, { eveningId: 'e1', displayName: 'Иван', responseStatus: 'going', contactKind: 'vk', contactValue: ' vk.com/ivan ' });
    expect(guest).toMatchObject({ nickname: 'Иван', response_status: 'going', contact_kind: 'vk', contact_value: 'vk.com/ivan' });
    expect((await listGuestPlaceholdersForEvening(db, 'e1'))[0]).toMatchObject({ contact_kind: 'vk', contact_value: 'vk.com/ivan' });
  });

  it('a phone contact also fills the phone field and the contact can be changed later', async () => {
    const guest = await createGuestPlaceholder(db, { eveningId: 'e1', displayName: 'Аня', contactKind: 'phone', contactValue: '+7 900 000-00-00' });
    expect(guest.phone).toBe('+7 900 000-00-00');
    const changed = await updateGuestPlaceholder(db, guest.id, { contact_kind: 'telegram', contact_value: '@anya' });
    expect(changed).toMatchObject({ contact_kind: 'telegram', contact_value: '@anya', phone: null });
  });

  it('ignores an unknown kind or an empty value', () => {
    expect(normalizeGuestContact('icq', '123')).toEqual({ kind: null, value: null });
    expect(normalizeGuestContact('vk', '  ')).toEqual({ kind: null, value: null });
  });

  it('builds a tappable link for each kind', () => {
    expect(guestContactHref('vk', 'ivan')).toBe('https://vk.com/ivan');
    expect(guestContactHref('vk', 'https://vk.com/id5')).toBe('https://vk.com/id5');
    expect(guestContactHref('telegram', '@anya')).toBe('https://t.me/anya');
    expect(guestContactHref('phone', '+7 900 000-00-00')).toBe('tel:+79000000000');
    expect(guestContactHref('vk', '')).toBeNull();
  });

  it('makes every «+N» a roster row linked to the guest and keeps the rows in step', async () => {
    const guest = await createGuestPlaceholder(db, { eveningId: 'e1', displayName: 'Иван', responseStatus: 'going', plusCount: 2 });
    const rows = async () => db.all<any>("SELECT id, display_name, companion_of, response_status FROM guest_player_placeholders WHERE evening_id = 'e1' ORDER BY created_at, id");
    let all = await rows();
    expect(all.map((row) => row.display_name).sort()).toEqual(['Иван', 'Иван +1', 'Иван +2']);
    expect(all.filter((row) => row.companion_of === guest.id).length).toBe(2);
    expect((await updateGuestPlaceholder(db, guest.id, { plus_count: 99 }))?.plus_count).toBe(10);
    expect((await rows()).length).toBe(11);
    expect((await updateGuestPlaceholder(db, guest.id, { plus_count: 1 }))?.plus_count).toBe(1);
    all = await rows();
    expect(all.length).toBe(2);
    await updateGuestPlaceholder(db, guest.id, { response_status: 'declined' });
    expect((await rows()).every((row) => row.response_status === 'declined')).toBe(true);
    const companion = all.find((row) => row.companion_of === guest.id)!;
    expect((await updateGuestPlaceholder(db, companion.id, { nickname: 'Пётр' }))?.nickname).toBe('Пётр');
  });

  it('gives guests saved before the change their «+N» rows when the evening is listed', async () => {
    const guest = await createGuestPlaceholder(db, { eveningId: 'e1', displayName: 'Анна', responseStatus: 'going' });
    await db.run('UPDATE guest_player_placeholders SET plus_count = 1 WHERE id = ?', [guest.id]);
    const listed = await listGuestPlaceholdersForEvening(db, 'e1');
    expect(listed.map((row: any) => row.nickname).sort()).toEqual(['Анна', 'Анна +1']);
  });
});
