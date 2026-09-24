import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { ensureOrganizerPlayerAccessSchema } from '../db/ensureOrganizerPlayerAccessSchema.ts';
import { settleEveningFromCloseout } from '../server/services/eveningCloseoutService.ts';
import { skipGatheredPost } from '../server/services/eveningGatheredPostService.ts';
import { evaluatePlayerAchievements } from '../server/services/playerAchievementsService.ts';
import { ORGANIZER_EVENING_REWARD } from '../server/services/staffRewards.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const cookie = () => `organizer_token=${generateOrganizerToken()}`;

async function setup(status: string, startsAt = new Date(Date.now() + 3600_000).toISOString()) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('s1','Пятница',?,'Europe/Moscow','CASUAL',?,20,100,?,?)`, [startsAt, status, now, now]);
  await db.run("INSERT INTO players (id,nickname,club_role,tokens,created_at,updated_at) VALUES ('org','Хозяин','organizer',0,?,?)", [now, now]);
  return { db, app, now };
}
const assignOrganizer = (db: DatabaseWrapper, now: string) => db.run(
  "INSERT INTO evening_staff_assignments (evening_id,organizer_player_id,assigned_at,updated_at) VALUES ('s1','org',?,?)", [now, now],
);

describe('evening organizer and game judge', () => {
  it('does not start an evening without its organizer', async () => {
    const { db, app, now } = await setup('published');
    const refused = await request(app).patch('/api/evenings/s1').set('Cookie', cookie()).send({ status: 'active' });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('organizer_required');
    await assignOrganizer(db, now);
    expect((await request(app).patch('/api/evenings/s1').set('Cookie', cookie()).send({ status: 'active' })).status).toBe(200);
  });

  it('assigns the signed-in organizer automatically when their login is linked to an organizer profile', async () => {
    const { db, app, now } = await setup('published');
    await ensureOrganizerPlayerAccessSchema(db);
    await db.run("INSERT INTO organizer_player_access (player_id, granted_at) VALUES ('org', ?)", [now]);
    const started = await request(app).patch('/api/evenings/s1').set('Cookie', `organizer_token=${generateOrganizerToken('org')}`).send({ status: 'active' });
    expect(started.status).toBe(200);
  });

  it('needs a club judge or an explicit guest judge for every game', async () => {
    const { db, app, now } = await setup('active');
    await assignOrganizer(db, now);
    await skipGatheredPost(db, 's1', 'test');
    const noJudge = await request(app).post('/api/games/evening/s1').set('Cookie', cookie()).send({ judge_name: 'Кто-то', seats: [] });
    expect(noJudge.body.code).toBe('judge_required');
    const guest = await request(app).post('/api/games/evening/s1').set('Cookie', cookie()).send({ judge_name: 'Гость', judge_guest: true, seats: [] });
    expect(guest.body.code).not.toBe('judge_required');
  });

  it('pays the organizer once per closed evening and counts it for achievements', async () => {
    const { db, now } = await setup('active', new Date().toISOString());
    await assignOrganizer(db, now);
    await settleEveningFromCloseout(db, 's1', { allow_missing_game_stats: true });
    await settleEveningFromCloseout(db, 's1', { allow_missing_game_stats: true });
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id = 'org'")).tokens)).toBe(ORGANIZER_EVENING_REWARD);
    await evaluatePlayerAchievements(db, 'org');
    expect(await db.get<any>("SELECT achievement_id FROM player_achievements WHERE player_id = 'org' AND achievement_id = 'first_organized'")).toBeTruthy();
  });

  it('reports organizers and judges and shows the counts on the player card', async () => {
    const { db, app, now } = await setup('active', new Date().toISOString());
    await assignOrganizer(db, now);
    await settleEveningFromCloseout(db, 's1', { allow_missing_game_stats: true });
    const report = await request(app).get('/api/analytics/staff?period=30d').set('Cookie', cookie());
    expect(report.status).toBe(200);
    expect(report.body.staff).toEqual([{ player_id: 'org', nickname: 'Хозяин', evenings: 1, games: 0 }]);
    const card = await request(app).get('/api/players/org').set('Cookie', cookie());
    expect(card.body.achievements.staff).toEqual({ judged_games: 0, organized_evenings: 1 });
  });
});
