import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { createVerifiedAward } from '../server/services/playerVerifiedAwardsService.ts';

const now = '2026-09-08T10:00:00.000Z';

describe('profile self-service and organizer access', () => {
  let db: DatabaseWrapper;
  let app: any;
  let selfCookie: string;
  let otherCookie: string;
  let organizerCookie: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    await db.run(`INSERT INTO players (id,nickname,full_name,telegram_user_id,telegram_username,phone,contact_status,lifecycle_status,elo,tokens,created_at,updated_at)
      VALUES ('p1','Player One','Old Name','111','playerone',NULL,'normal','normal',1000,0,?,?),
             ('p2','Player Two',NULL,'222',NULL,NULL,'normal','normal',1000,0,?,?)`, [now, now, now, now]);
    selfCookie = `player_token=${generatePlayerSessionToken('p1')}`;
    otherCookie = `player_token=${generatePlayerSessionToken('p2')}`;
    organizerCookie = `organizer_token=${generateOrganizerToken()}`;
  });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('player edits only own profile and unspecified fields are preserved', async () => {
    const response = await request(app).patch('/api/player/me').set('Cookie', selfCookie).send({ phone: '+7 999 111-22-33', birth_day: 8, birth_month: 9, birth_year: null });
    expect(response.status).toBe(200);
    const p1 = await db.get<any>("SELECT * FROM players WHERE id='p1'");
    const p2 = await db.get<any>("SELECT * FROM players WHERE id='p2'");
    expect(p1?.nickname).toBe('Player One');
    expect(p1?.full_name).toBe('Old Name');
    expect(p1?.phone).toBe('+7 999 111-22-33');
    expect(p1?.birth_day).toBe(8);
    expect(p2?.phone).toBeNull();

    const wrong = await request(app).patch('/api/player/me').set('Cookie', otherCookie).send({ nickname: 'Changed Other' });
    expect(wrong.status).toBe(200);
    expect((await db.get<any>("SELECT nickname FROM players WHERE id='p1'"))?.nickname).toBe('Player One');
  });

  it('rejects invalid self phone/date and organizer can correct private fields', async () => {
    expect((await request(app).patch('/api/player/me').set('Cookie', selfCookie).send({ phone: 'bad' })).status).toBe(400);
    expect((await request(app).patch('/api/player/me').set('Cookie', selfCookie).send({ birth_day: 31, birth_month: 2 })).status).toBe(400);
    const organizer = await request(app).patch('/api/players/p1/profile-private').set('Cookie', organizerCookie).send({ birth_day: 29, birth_month: 2, birth_year: null, birthday_visibility: 'day_month' });
    expect(organizer.status).toBe(200);
    expect((await db.get<any>("SELECT birth_day,birthday_visibility FROM players WHERE id='p1'"))?.birth_day).toBe(29);
  });
});

describe('verified official awards', () => {
  let db: DatabaseWrapper;
  let app: any;
  let playerCookie: string;
  let organizerCookie: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,elo,tokens,birth_day,birth_month,birth_year,birthday_visibility,created_at,updated_at)
      VALUES ('award-player','Award Player','normal','normal',1234,0,5,4,1990,'private',?,?)`, [now, now]);
    playerCookie = `player_token=${generatePlayerSessionToken('award-player')}`;
    organizerCookie = `organizer_token=${generateOrganizerToken()}`;
  });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('player can suggest but cannot publish an award directly', async () => {
    const suggestion = await request(app).post('/api/player/award-suggestions').set('Cookie', playerCookie).send({ kind: 'medal', tournament_name: 'Old Cup', description: 'Second place', comment: 'Please verify' });
    expect(suggestion.status).toBe(201);
    expect((await db.get<any>('SELECT status FROM player_award_suggestions LIMIT 1'))?.status).toBe('pending');
    expect(Number((await db.get<any>('SELECT COUNT(*) AS count FROM player_verified_awards'))?.count)).toBe(0);
    expect((await request(app).post('/api/players/award-player/verified-awards').set('Cookie', playerCookie).send({ kind: 'medal', title: 'Fake' })).status).toBe(401);
  });

  it('organizer approves or rejects suggestions and only verified awards are public', async () => {
    const first = await request(app).post('/api/player/award-suggestions').set('Cookie', playerCookie).send({ kind: 'medal', tournament_name: 'Verified Cup', description: 'Medal', comment: 'verify' });
    const firstId = first.body.suggestion.id;
    const approved = await request(app).post(`/api/players/award-suggestions/${firstId}/review`).set('Cookie', organizerCookie).send({ action: 'approve', award: { kind: 'medal', title: 'Silver medal' } });
    expect(approved.status).toBe(200);
    expect(approved.body.award.verification_status).toBe('verified');

    const second = await request(app).post('/api/player/award-suggestions').set('Cookie', playerCookie).send({ kind: 'trophy', tournament_name: 'Wrong', comment: 'reject' });
    const rejected = await request(app).post(`/api/players/award-suggestions/${second.body.suggestion.id}/review`).set('Cookie', organizerCookie).send({ action: 'reject' });
    expect(rejected.status).toBe(200);

    await createVerifiedAward(db, 'award-player', { kind: 'certificate', title: 'Pending private' }, 'organizer', 'pending');
    const publicProfile = await request(app).get('/api/public/players/award-player/profile');
    expect(publicProfile.status).toBe(200);
    expect(publicProfile.body.verified_awards.map((award: any) => award.title)).toEqual(['Silver medal']);
    expect(publicProfile.body.player.birthday).toBeNull();
  });

  it('manual historical awards do not alter Elo or game statistics', async () => {
    const beforeElo = Number((await db.get<any>("SELECT elo FROM players WHERE id='award-player'"))?.elo);
    const beforeGames = Number((await db.get<any>('SELECT COUNT(*) AS count FROM games'))?.count);
    const created = await request(app).post('/api/players/award-player/verified-awards').set('Cookie', organizerCookie).send({ kind: 'trophy', title: 'Cup 2019', tournament_name: 'Legacy Tournament', award_year: 2019, source_type: 'historical' });
    expect(created.status).toBe(201);
    expect(Number((await db.get<any>("SELECT elo FROM players WHERE id='award-player'"))?.elo)).toBe(beforeElo);
    expect(Number((await db.get<any>('SELECT COUNT(*) AS count FROM games'))?.count)).toBe(beforeGames);
    expect(Number((await db.get<any>('SELECT COUNT(*) AS count FROM tournaments'))?.count)).toBe(0);
  });
});
