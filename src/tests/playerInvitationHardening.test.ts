import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

describe('hardened player evening invitations', () => {
  let db: DatabaseWrapper;
  let app: any;
  let inviterCookie: string;
  let future: string;
  const oldPlayerAppUrl = process.env.PLAYER_APP_URL;

  beforeEach(async () => {
    process.env.PLAYER_APP_URL = 'https://club.example.test';
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    inviterCookie = `player_token=${generatePlayerSessionToken('inviter')}`;
    future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO players (id,nickname,telegram_user_id,game_level,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at)
      VALUES
        ('inviter','Приглашающий',NULL,'tournament','normal','normal','none',1000,500,?,?),
        ('target','Цель','900001','club','normal','normal','none',1000,500,?,?),
        ('registered','Уже записан',NULL,'club','normal','normal','none',1000,500,?,?),
        ('reserve','В резерве',NULL,'club','normal','normal','none',1000,500,?,?)
    `,[now,now,now,now,now,now,now,now]);

    await db.run(`
      INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('casual-evening','Пятничный вечер',?,'Europe/Moscow','CASUAL','published',20,400,?,?)
    `,[future,now,now]);

    await db.run(`
      INSERT INTO evening_participants
        (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES
        ('ep-inviter','casual-evening','inviter','going','registered','pending','unknown','unpaid',0,0,?,?),
        ('ep-registered','casual-evening','registered','going','registered','pending','unknown','unpaid',0,0,?,?),
        ('ep-reserve','casual-evening','reserve','reserve','reserve','pending','unknown','unpaid',0,0,?,?)
    `,[now,now,now,now,now,now]);
  });

  afterEach(() => {
    if (oldPlayerAppUrl == null) delete process.env.PLAYER_APP_URL;
    else process.env.PLAYER_APP_URL = oldPlayerAppUrl;
    try { db.sqlite.close(); } catch {}
  });

  it('exposes registered and reserve states instead of offering a misleading CTA', async () => {
    const registered = await request(app)
      .get('/api/player/profiles/registered/invitation-context')
      .set('Cookie', inviterCookie);
    expect(registered.status).toBe(200);
    expect(registered.body.can_invite).toBe(false);
    expect(registered.body.evenings[0]).toMatchObject({ id: 'casual-evening', state: 'registered' });

    const reserve = await request(app)
      .get('/api/player/profiles/reserve/invitation-context')
      .set('Cookie', inviterCookie);
    expect(reserve.status).toBe(200);
    expect(reserve.body.can_invite).toBe(false);
    expect(reserve.body.evenings[0]).toMatchObject({ id: 'casual-evening', state: 'reserve' });
  });

  it('creates one invite, keeps it idempotent and embeds a direct evening link without booking the player', async () => {
    const first = await request(app)
      .post('/api/player/profiles/target/invitations')
      .set('Cookie', inviterCookie)
      .send({ evening_id: 'casual-evening' });
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(true);

    const repeated = await request(app)
      .post('/api/player/profiles/target/invitations')
      .set('Cookie', inviterCookie)
      .send({ evening_id: 'casual-evening' });
    expect(repeated.status).toBe(200);
    expect(repeated.body.created).toBe(false);

    const participant = await db.get<any>(`SELECT * FROM evening_participants WHERE evening_id='casual-evening' AND player_id='target'`);
    expect(participant).toBeUndefined();

    const outbox = await db.get<any>(`SELECT text FROM telegram_message_outbox WHERE event_type='evening_invite' LIMIT 1`);
    expect(String(outbox?.text || '')).toContain('https://club.example.test/player/events/casual-evening');
    expect(String(outbox?.text || '')).toContain('не создаёт запись автоматически');
  });

  it('enforces the per-evening sender limit before creating another invitation', async () => {
    await request(app)
      .get('/api/player/profiles/target/invitation-context')
      .set('Cookie', inviterCookie)
      .expect(200);

    const now = new Date().toISOString();
    for (let index = 1; index <= 5; index += 1) {
      const id = `limited-${index}`;
      await db.run(`INSERT INTO players (id,nickname,game_level,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at) VALUES (?,?, 'club','normal','normal','none',1000,500,?,?)`,[id,`Лимит ${index}`,now,now]);
      await db.run(`INSERT INTO player_evening_invitations (id,evening_id,inviter_player_id,recipient_player_id,status,created_at,updated_at) VALUES (?,?,?,?, 'sent',?,?)`,[`invite-${index}`,'casual-evening','inviter',id,now,now]);
    }

    const context = await request(app)
      .get('/api/player/profiles/target/invitation-context')
      .set('Cookie', inviterCookie);
    expect(context.status).toBe(200);
    expect(context.body.can_invite).toBe(false);
    expect(context.body.evenings[0]).toMatchObject({ state: 'sender_limit' });

    const rejected = await request(app)
      .post('/api/player/profiles/target/invitations')
      .set('Cookie', inviterCookie)
      .send({ evening_id: 'casual-evening' });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toContain('не больше 5');
  });
});
