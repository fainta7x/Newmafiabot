import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

const stamp = '2026-09-08T10:00:00.000Z';

describe('premium profile showcase API', () => {
  let db: DatabaseWrapper;
  let app: any;
  let playerCookie: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,game_level,club_role,elo,tokens,created_at,updated_at,profile_visibility_json) VALUES ('p1','Player','normal','normal','club','member',1000,0,?,?,'{}')`, [stamp, stamp]);
    playerCookie = `player_token=${generatePlayerSessionToken('p1')}`;
    await db.run(`INSERT INTO player_verified_awards (id,player_id,kind,title,verification_status,source_type,created_at,updated_at) VALUES
      ('a1','p1','trophy','Кубок клуба','verified','manual',?,?),
      ('a2','p1','nomination','Лучший ход','verified','manual',?,?),
      ('a3','p1','medal','Финалист','verified','manual',?,?)`, [stamp, stamp, stamp, stamp, stamp, stamp]);
  });

  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('returns verified showcase and allows owner to pin at most three awards', async () => {
    const initial = await request(app).get('/api/player/profiles/p1/showcase').set('Cookie', playerCookie);
    expect(initial.status).toBe(200);
    expect(initial.body.awards).toHaveLength(3);
    expect(initial.body.timeline.some((item: any) => item.type === 'joined')).toBe(true);

    const pin = await request(app).patch('/api/player/profiles/p1/awards/pins').set('Cookie', playerCookie).send({ award_ids: ['a2', 'a1'] });
    expect(pin.status).toBe(200);
    const updated = await request(app).get('/api/player/profiles/p1/showcase').set('Cookie', playerCookie);
    expect(updated.body.pinned_awards.map((item: any) => item.id)).toEqual(['a2', 'a1']);

    const tooMany = await request(app).patch('/api/player/profiles/p1/awards/pins').set('Cookie', playerCookie).send({ award_ids: ['a1', 'a2', 'a3', 'a4'] });
    expect(tooMany.status).toBe(400);
  });

  it('allows organizer to add a verified club milestone visible on the timeline', async () => {
    const response = await request(app)
      .post('/api/player/profiles/p1/milestones')
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`)
      .send({ title: 'Первый турнир', description: 'Дебют на клубном турнире', milestone_date: '2026-09-01', icon: '★' });
    expect(response.status).toBe(201);

    const showcase = await request(app).get('/api/player/profiles/p1/showcase').set('Cookie', playerCookie);
    expect(showcase.body.timeline.some((item: any) => item.type === 'milestone' && item.title === 'Первый турнир')).toBe(true);
  });
});
