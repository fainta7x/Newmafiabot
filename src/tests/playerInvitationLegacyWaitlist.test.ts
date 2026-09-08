import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { normalizeCanonicalEveningResponse } from '../lib/eveningDomain.ts';
import { loadInvitationContextsForRecipients } from '../server/services/playerInvitationEligibilityService.ts';

describe('player invitation legacy waitlist normalization', () => {
  let db: DatabaseWrapper;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.run(`
      INSERT INTO players (id,nickname,game_level,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at)
      VALUES
        ('inviter','Приглашающий','club','normal','normal','none',1000,100,?,?),
        ('legacy-waitlist','Legacy waitlist','club','normal','normal','none',1000,100,?,?)
    `,[now,now,now,now]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('evening','Вечер',?,'Europe/Moscow','CASUAL','published',20,400,?,?)`,[future,now,now]);
    await db.run(`
      INSERT INTO evening_participants
        (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES
        ('p-inviter','evening','inviter','going','registered','pending','unknown','unpaid',0,0,?,?),
        ('p-waitlist','evening','legacy-waitlist','unanswered','waitlist','pending','unknown','unpaid',0,0,?,?)
    `,[now,now,now,now]);
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('does not classify a plain historical waitlist row as reserve', async () => {
    const contexts = await loadInvitationContextsForRecipients(db,'inviter',['legacy-waitlist']);
    const context = contexts.get('legacy-waitlist');
    expect(context?.can_invite).toBe(true);
    expect(context?.evenings[0]?.state).toBe('eligible');
  });

  it('preserves canonical response precedence while normalizing legacy waitlist values', () => {
    expect(normalizeCanonicalEveningResponse('waitlist','unknown')).toBe('unanswered');
    expect(normalizeCanonicalEveningResponse('waitlist','late')).toBe('late');
    expect(normalizeCanonicalEveningResponse('unanswered','late')).toBe('unanswered');
  });
});
