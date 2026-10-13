import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureInviteAudienceSchema } from '../db/ensureInviteAudienceSchema.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadDirectContacts, loadInvitePreferences, saveInvitePreferences } from '../server/services/playerInvitePreferencesService.ts';
import { loadPokerInviteCandidates, queuePokerInvite } from '../server/services/pokerInviteService.ts';
import { loadInvitationContextsForRecipients } from '../server/services/playerInvitationEligibilityService.ts';

let db: DatabaseWrapper;
beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  await ensureInviteAudienceSchema(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO players (id,nickname,telegram_user_id,telegram_username,game_level,tokens,created_at,updated_at)
    VALUES ('alice','Алиса','1001','alice_tg','club',5000,?,?),('bob','Боб','1002','bob_tg','club',5000,?,?)`, [now, now, now, now]);
});
afterEach(() => { try { db.sqlite.close(); } catch {} });

describe('player invitation settings', () => {
  it('allows everything by default and keeps direct contact private', async () => {
    expect(await loadInvitePreferences(db, 'bob')).toEqual({ blocked_kinds: [], allow_direct_contact: false });
    expect((await loadDirectContacts(db, ['bob'])).size).toBe(0);
  });

  it('saves blocked kinds, ignores unknown ones and shares contact links only when allowed', async () => {
    await saveInvitePreferences(db, 'bob', { blockedKinds: ['POKER', 'NOVICE', 'nonsense'], allowDirectContact: true });
    expect(await loadInvitePreferences(db, 'bob')).toEqual({ blocked_kinds: ['NOVICE', 'POKER'], allow_direct_contact: true });
    expect((await loadDirectContacts(db, ['bob'])).get('bob')).toEqual({ vk_url: null, telegram_url: 'https://t.me/bob_tg' });
  });

  it('hides a player from poker invitations once they switch poker off', async () => {
    await saveInvitePreferences(db, 'bob', { blockedKinds: ['POKER'] });
    const candidates = await loadPokerInviteCandidates(db, 'alice', { vkLoader: async () => [] });
    expect(candidates.some((item) => item.player_id === 'bob')).toBe(false);
    await expect(queuePokerInvite(db, { senderPlayerId: 'alice', senderNickname: 'Алиса', targetPlayerId: 'bob', lobbyId: 'l', lobbyTitle: 'Стол' }))
      .rejects.toMatchObject({ code: 'invites_off' });
  });

  it('does not offer an evening format the recipient switched off', async () => {
    const now = new Date(Date.now() + 86_400_000).toISOString();
    await db.run("INSERT INTO game_evenings (id,title,starts_at,status,format,default_price,created_at,updated_at) VALUES ('e1','Вечер',?,'published','CASUAL',400,?,?)", [now, now, now]);
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,created_at,updated_at) VALUES ('p1','e1','alice','going','going',?,?)", [now, now]);
    expect((await loadInvitationContextsForRecipients(db, 'alice', ['bob'])).get('bob')?.can_invite).toBe(true);
    await saveInvitePreferences(db, 'bob', { blockedKinds: ['CASUAL'] });
    const context = (await loadInvitationContextsForRecipients(db, 'alice', ['bob'])).get('bob');
    expect(context?.can_invite).toBe(false);
    expect(context?.reason).toBe('unavailable_format');
  });
});
