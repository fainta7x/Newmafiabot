import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

const stamp = '2026-10-10T10:00:00.000Z';

describe('learning statistics: who passed what, who is stuck', () => {
  let db: DatabaseWrapper;
  let app: any;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    for (const [id, nick] of [['p1', 'Анна'], ['p2', 'Борис'], ['p3', 'Вера']]) {
      await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at) VALUES (?,?,'normal','normal','none',1000,1000,?,?)`, [id, nick, stamp, stamp]);
    }
  });
  const as = (playerId: string) => ({ Cookie: `player_token=${generatePlayerSessionToken(playerId)}` });
  const organizer = () => ({ Cookie: `organizer_token=${generateOrganizerToken()}` });
  const report = (playerId: string, body: Record<string, unknown>) => request(app).post('/api/player/learning-activity').set(as(playerId)).send(body);

  it('counts every finished try, keeps the best score and the first pass, and ignores visitors without an account', async () => {
    expect((await report('p1', { track: 'reasoning-course', item: 'facts', score: 6, maxScore: 20, passed: false })).status).toBe(204);
    expect((await report('p1', { track: 'reasoning-course', item: 'facts', score: 12, maxScore: 20, passed: true })).status).toBe(204);
    await report('p1', { track: 'reasoning-course', item: 'facts', score: 8, maxScore: 20, passed: false });
    const row = await db.get<any>("SELECT * FROM player_learning_activity WHERE player_id = 'p1' AND track = 'reasoning-course' AND item = 'facts'");
    expect(row).toMatchObject({ attempts: 3, best_score: 12, max_score: 20 });
    expect(row.passed_at).toBeTruthy();

    const visitor = await request(app).post('/api/player/learning-activity').send({ track: 'reasoning-course', item: 'facts', passed: true });
    expect(visitor.status).toBe(204);
    expect((await db.get<any>('SELECT COUNT(*) AS n FROM player_learning_activity')).n).toBe(1);
  });

  it('refuses things that are not exercises', async () => {
    expect((await report('p1', { track: 'nonsense', item: 'facts', passed: true })).status).toBe(400);
    expect((await report('p1', { track: 'reasoning-course', item: 'nonsense', passed: true })).status).toBe(400);
    expect((await report('p1', { track: 'reasoning-course', item: 'facts' })).status).toBe(400);
    expect((await report('p1', { track: 'judge-training', item: 'free', passed: true, score: -5, maxScore: 'x' })).status).toBe(204);
    expect((await db.get<any>("SELECT best_score, max_score FROM player_learning_activity WHERE item = 'free'"))).toMatchObject({ best_score: null, max_score: null });
  });

  it('shows the organizer every player with the tries, and only the organizer', async () => {
    await report('p1', { track: 'reasoning-labs', item: 'vote', score: 8, maxScore: 12, passed: true });
    for (let attempt = 0; attempt < 3; attempt += 1) await report('p2', { track: 'reasoning-course', item: 'facts', score: 5, maxScore: 20, passed: false });
    expect((await request(app).get('/api/learning/activity').set(as('p1'))).status).toBe(401);
    const response = await request(app).get('/api/learning/activity').set(organizer());
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const byName = Object.fromEntries(response.body.players.map((player: any) => [player.nickname, player.items]));
    expect(byName['Анна']['reasoning-labs:vote']).toMatchObject({ attempts: 1, best_score: 8, max_score: 12 });
    expect(byName['Анна']['reasoning-labs:vote'].passed_at).toBeTruthy();
    expect(byName['Борис']['reasoning-course:facts']).toMatchObject({ attempts: 3, passed_at: null });
    expect(byName['Вера']).toEqual({});
  });
});
