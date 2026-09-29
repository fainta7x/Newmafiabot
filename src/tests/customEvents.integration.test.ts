import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const cookie = (id: string) => `player_token=${generatePlayerSessionToken(id)}`;

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db), now = new Date().toISOString();
  for (const [id, stage, formats] of [['host','CLUB_PLAYER','CUSTOM'],['member','CLUB_PLAYER',null],['newbie','NOVICE_ACTIVE',null],['guest','CLUB_PLAYER',null]] as const) {
    await db.run(`INSERT INTO players (id,nickname,telegram_user_id,lifecycle_status,source,game_level,club_role,judge_level,organize_formats,club_stage,created_at,updated_at)
      VALUES (?,?,?,?,?,'club','member','none',?,?,?,?)`, [id,id,`${id}-tg`,'normal','telegram',formats,stage,now,now]);
  }
  return { db, app };
}

const eventBody = (visibility='everyone') => ({
  title:'Киновечер',description:'Смотрим и обсуждаем',starts_at:new Date(Date.now()+86400000).toISOString(),ends_at:new Date(Date.now()+90000000).toISOString(),
  signup_deadline:new Date(Date.now()+82800000).toISOString(),venue:'Клуб',participant_limit:2,price_rub:300,visibility,allow_guest:true,registration_open:true,
});

describe('custom events', () => {
  it('requires the fourth mark and keeps the event outside Mafia tables', async () => {
    const { db, app } = await setup();
    expect((await request(app).post('/api/custom-events').set('Cookie',cookie('member')).send(eventBody())).status).toBe(403);
    const created = await request(app).post('/api/custom-events').set('Cookie',cookie('host')).send(eventBody());
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({title:'Киновечер',status:'draft',organizer_player_id:'host'});
    expect(await db.get('SELECT id FROM game_evenings WHERE id=?',[created.body.id])).toBeNull();
    expect(await db.get('SELECT id FROM games WHERE evening_id=?',[created.body.id])).toBeNull();
    expect((await request(app).get('/api/player/calendar').set('Cookie',cookie('member'))).body.events.some((x:any)=>x.id===created.body.id)).toBe(false);
    await request(app).post(`/api/custom-events/${created.body.id}/status`).set('Cookie',cookie('host')).send({status:'published'}).expect(200);
    const calendar = await request(app).get('/api/player/calendar').set('Cookie',cookie('member'));
    expect(calendar.body.events.find((x:any)=>x.id===created.body.id)).toMatchObject({event_type:'custom',format:'CUSTOM',participant_count:0});
  });

  it('enforces visibility, invitations, guest permission and capacity', async () => {
    const { app } = await setup();
    const created = await request(app).post('/api/custom-events').set('Cookie',cookie('host')).send(eventBody('invite'));
    const id = created.body.id;
    await request(app).post(`/api/custom-events/${id}/status`).set('Cookie',cookie('host')).send({status:'published'}).expect(200);
    expect((await request(app).get('/api/player/calendar').set('Cookie',cookie('member'))).body.events.some((x:any)=>x.id===id)).toBe(false);
    await request(app).put(`/api/custom-events/${id}/invitations`).set('Cookie',cookie('host')).send({player_ids:['member']}).expect(200);
    expect((await request(app).get('/api/player/calendar').set('Cookie',cookie('member'))).body.events.some((x:any)=>x.id===id)).toBe(true);
    const registered = await request(app).post(`/api/custom-events/${id}/register`).set('Cookie',cookie('member')).send({with_guest:true});
    expect(registered.status,JSON.stringify(registered.body)).toBe(200);
    expect(registered.body.event.participant_count).toBe(2);
    expect((await request(app).post(`/api/custom-events/${id}/register`).set('Cookie',cookie('guest')).send({with_guest:false})).status).toBe(403);
    await request(app).delete(`/api/custom-events/${id}/register`).set('Cookie',cookie('member')).expect(200);
    expect((await request(app).get(`/api/custom-events/${id}`).set('Cookie',cookie('member'))).body.registration_status).toBeNull();
  });

  it('shows club-only events only to established club players', async () => {
    const { app } = await setup();
    const created = await request(app).post('/api/custom-events').set('Cookie',cookie('host')).send(eventBody('club'));
    await request(app).post(`/api/custom-events/${created.body.id}/status`).set('Cookie',cookie('host')).send({status:'published'}).expect(200);
    expect((await request(app).get('/api/player/calendar').set('Cookie',cookie('member'))).body.events.some((x:any)=>x.id===created.body.id)).toBe(true);
    expect((await request(app).get('/api/player/calendar').set('Cookie',cookie('newbie'))).body.events.some((x:any)=>x.id===created.body.id)).toBe(false);
  });
});
