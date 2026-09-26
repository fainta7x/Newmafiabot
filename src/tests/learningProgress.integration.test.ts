import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { ensureSplitVoteProgressSchema } from '../db/ensureSplitVoteProgressSchema.ts';
import { evaluatePlayerAchievements } from '../server/services/playerAchievementsService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  for (const [id, nickname] of [['p1', 'Анна'], ['p2', 'Борис'], ['p3', 'Вера']]) {
    await db.run('INSERT INTO players (id, nickname, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, nickname, now, now]);
  }
  await ensureSplitVoteProgressSchema(db);
  for (const level of ['basic', 'advanced', 'interactive', 'expert']) {
    await db.run("INSERT INTO player_split_vote_progress (player_id, level, passed_at) VALUES ('p1', ?, '2026-09-26 10:00:00')", [level]);
  }
  await db.run("INSERT INTO player_split_vote_progress (player_id, level, passed_at) VALUES ('p2', 'basic', '2026-09-25 09:00:00')");
  return { db, app, auth: { Cookie: `organizer_token=${generateOrganizerToken()}` } };
}

describe('learning progress for the curator', () => {
  it('lists every player with the exams they passed and when, for organizers only', async () => {
    const { app, auth } = await setup();
    expect((await request(app).get('/api/learning/split-vote')).status).toBe(401);
    const response = await request(app).get('/api/learning/split-vote').set(auth);
    expect(response.status).toBe(200);
    const byId = Object.fromEntries(response.body.players.map((row: any) => [row.id, row]));
    expect(Object.keys(byId['p1'].passed).sort()).toEqual(['advanced', 'basic', 'expert', 'interactive']);
    expect(byId['p2'].passed).toEqual({ basic: '2026-09-25 09:00:00' });
    expect(byId['p3'].passed).toEqual({});
    const card = await request(app).get('/api/learning/split-vote/p2').set(auth);
    expect(card.body).toMatchObject({ id: 'p2', nickname: 'Борис', passed: { basic: '2026-09-25 09:00:00' } });
  });

  it('awards «Нулевой пациент» only for the expert exam', async () => {
    const { db } = await setup();
    expect(await evaluatePlayerAchievements(db, 'p1')).toContain('split_vote_expert');
    expect(await evaluatePlayerAchievements(db, 'p2')).not.toContain('split_vote_expert');
  });
});
