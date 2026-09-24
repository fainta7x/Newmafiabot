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
import { staffReportRange } from '../server/routes/analyticsRoutes.ts';

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
    // Organizing is shown only for organizers, judging only for those who judged; split by evening kind.
    expect(card.body.staff_stats).toEqual({
      judged: null,
      organized: { total: 1, by_format: [{ format: 'CASUAL', label: 'клубных', count: 1 }] },
    });
    await db.run("INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES ('plain','Игрок',0,?,?)", [now, now]);
    expect((await request(app).get('/api/players/plain').set('Cookie', cookie())).body.staff_stats).toEqual({ judged: null, organized: null });
    await db.run("UPDATE players SET club_role = 'member' WHERE id = 'org'");
    expect((await request(app).get('/api/players/org').set('Cookie', cookie())).body.staff_stats.organized).toBeNull();
  });

  it('reports by calendar month and by the active rating season', async () => {
    const { db } = await setup('active');
    const tables = new Set(['rating_periods']);
    const now = Date.parse('2026-09-24T12:00:00+03:00');
    expect(await staffReportRange(db, 'month', tables, now)).toMatchObject({
      since: new Date('2026-09-01T00:00:00+03:00').toISOString(), until: new Date('2026-10-01T00:00:00+03:00').toISOString(),
    });
    expect(await staffReportRange(db, 'prev_month', tables, Date.parse('2026-01-10T12:00:00+03:00'))).toMatchObject({
      since: new Date('2025-12-01T00:00:00+03:00').toISOString(), until: new Date('2026-01-01T00:00:00+03:00').toISOString(),
    });
    const stamp = new Date().toISOString();
    await db.run(`INSERT INTO rating_periods (id,title,type,starts_at,ends_at,status,auto_include,created_at,updated_at)
      VALUES ('rs','Осень 2026','RATING','2026-09-01T00:00:00.000Z','2026-11-30T20:59:59.000Z','active',1,?,?)`, [stamp, stamp]);
    expect(await staffReportRange(db, 'season', tables, now)).toMatchObject({ label: 'Осень 2026', since: '2026-09-01T00:00:00.000Z' });
  });

  it('credits tournament games to the tournament judge when the game has no own judge', async () => {
    const { db, app, now } = await setup('active');
    await db.run("INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES ('judge','Судья',0,?,?)", [now, now]);
    await db.run("INSERT INTO tournaments (id,title,date,status,judge_player_id,created_at,updated_at) VALUES ('t1','Кубок',?,'active','judge',?,?)", [now, now, now]);
    await db.run("INSERT INTO tournament_games (id,tournament_id,game_number,status,completed_at) VALUES ('tg1','t1',1,'completed',?)", [now]);
    const report = await request(app).get('/api/analytics/staff?period=month').set('Cookie', cookie());
    expect(report.body.staff).toEqual([{ player_id: 'judge', nickname: 'Судья', evenings: 0, games: 1 }]);
  });
});
