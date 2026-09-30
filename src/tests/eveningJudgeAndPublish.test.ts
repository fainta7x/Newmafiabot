import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../db/ensureOrganizerPlayerAccessSchema.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

// Owner decision 2026-09-30: «Судья вечера»; novice and club evenings start with the owner as
// organizer and judge; publishing needs an organizer and a judge who may run that kind of evening.
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const organizer = () => `organizer_token=${generateOrganizerToken()}`;
const later = () => new Date(Date.now() + 3 * 86400000).toISOString();

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO players (id,nickname,club_role,judge_level,host_formats,organize_formats,created_at,updated_at) VALUES
    (?, 'Владелец', 'organizer', 'judge', 'NOVICE,CASUAL,RATING', NULL, ?, ?),
    ('club-judge', 'Клубный судья', 'member', 'host', 'CASUAL', NULL, ?, ?),
    ('rating-judge', 'Рейтинговый судья', 'member', 'judge', 'RATING', NULL, ?, ?),
    ('host', 'Хозяйка', 'member', 'none', NULL, 'CASUAL', ?, ?)`,
  [PRIMARY_ORGANIZER_PLAYER_ID, now, now, now, now, now, now, now, now]);
  return { db, app };
}
const staff = (db: DatabaseWrapper, id: string) =>
  db.get<any>('SELECT organizer_player_id, judge_player_id FROM evening_staff_assignments WHERE evening_id = ?', [id]);

describe('«Судья вечера» and publishing', () => {
  it('a new club or novice evening starts with the owner as organizer and judge; a rating one does not', async () => {
    const { db, app } = await setup();
    for (const format of ['CASUAL', 'NOVICE']) {
      const created = await request(app).post('/api/evenings').set('Cookie', organizer())
        .send({ title: 'Вечер', starts_at: later(), format, status: 'draft' });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(await staff(db, created.body.id)).toEqual({ organizer_player_id: PRIMARY_ORGANIZER_PLAYER_ID, judge_player_id: PRIMARY_ORGANIZER_PLAYER_ID });
      expect((await request(app).patch(`/api/evenings/${created.body.id}`).set('Cookie', organizer()).send({ status: 'published' })).status).toBe(200);
    }
    const rating = await request(app).post('/api/evenings').set('Cookie', organizer())
      .send({ title: 'Рейтинг', starts_at: later(), format: 'RATING', status: 'draft', default_price: 300 });
    expect(await staff(db, rating.body.id)).toBeNull();
  });

  it('a draft may be incomplete, but publishing needs an organizer and a judge who may host that kind', async () => {
    const { db, app } = await setup();
    const rating = await request(app).post('/api/evenings').set('Cookie', organizer())
      .send({ title: 'Рейтинг', starts_at: later(), format: 'RATING', status: 'draft', default_price: 300 });
    const id = String(rating.body.id);
    const publish = () => request(app).patch(`/api/evenings/${id}`).set('Cookie', organizer()).send({ status: 'published' });

    let refused = await publish();
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('организатора вечера');
    await request(app).patch(`/api/evenings/${id}/staff`).set('Cookie', organizer()).send({ organizer_player_id: PRIMARY_ORGANIZER_PLAYER_ID }).expect(200);
    refused = await publish();
    expect(refused.body.error).toContain('судью вечера');

    // A judge without the rating mark is refused when chosen.
    const wrongJudge = await request(app).patch(`/api/evenings/${id}/staff`).set('Cookie', organizer()).send({ judge_player_id: 'club-judge' });
    expect(wrongJudge.status).toBe(400);
    expect(wrongJudge.body.error).toContain('Клубный судья не может вести');
    const judged = await request(app).patch(`/api/evenings/${id}/staff`).set('Cookie', organizer()).send({ judge_player_id: 'rating-judge' });
    expect(judged.status, JSON.stringify(judged.body)).toBe(200);
    expect(judged.body.judge).toEqual({ player_id: 'rating-judge', nickname: 'Рейтинговый судья' });
    expect(judged.body.judges.map((player: any) => player.id).sort()).toEqual([PRIMARY_ORGANIZER_PLAYER_ID, 'rating-judge'].sort());

    // The mark taken away later still stops the publication.
    await db.run("UPDATE players SET host_formats = 'CASUAL' WHERE id = 'rating-judge'");
    refused = await publish();
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('Рейтинговый судья не может вести');
    await db.run("UPDATE players SET host_formats = 'RATING' WHERE id = 'rating-judge'");
    expect((await publish()).status).toBe(200);

    // Removing the organizer keeps the evening judge.
    await request(app).patch(`/api/evenings/${id}/staff`).set('Cookie', organizer()).send({ organizer_player_id: null }).expect(200);
    expect(await staff(db, id)).toEqual({ organizer_player_id: null, judge_player_id: 'rating-judge' });
  });

  it('the host of an evening may change its judge but not its organizer', async () => {
    const { db, app } = await setup();
    const host = `player_token=${generatePlayerSessionToken('host')}`;
    const created = await request(app).post('/api/evenings').set('Cookie', host)
      .send({ title: 'Мой вечер', starts_at: later(), format: 'CASUAL', status: 'draft' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = String(created.body.id);
    expect(await staff(db, id)).toEqual({ organizer_player_id: 'host', judge_player_id: PRIMARY_ORGANIZER_PLAYER_ID });
    expect((await request(app).patch(`/api/evenings/${id}/staff`).set('Cookie', host).send({ judge_player_id: 'club-judge' })).status).toBe(200);
    expect((await request(app).patch(`/api/evenings/${id}/staff`).set('Cookie', host).send({ organizer_player_id: 'club-judge' })).status).toBe(401);
    expect((await request(app).patch(`/api/evenings/${id}/staff`).set('Cookie', host).send({ judge_player_id: 'club-judge', organizer_player_id: null })).status).toBe(401);
    expect(await staff(db, id)).toEqual({ organizer_player_id: 'host', judge_player_id: 'club-judge' });
    expect((await request(app).patch(`/api/evenings/${id}`).set('Cookie', host).send({ status: 'published' })).status).toBe(200);
  });
});
