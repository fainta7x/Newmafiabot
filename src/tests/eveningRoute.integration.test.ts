import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { currentRouteStage } from '../server/services/eveningRouteService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const organizerCookie = () => `organizer_token=${generateOrganizerToken()}`;
const HOUR = 3600_000;

describe('evening route', () => {
  it('picks the stage from the evening state', () => {
    const now = Date.parse('2026-09-24T09:00:00Z'); // Thursday 12:00 MSK
    const games = { total: 0, unfinished: 0 };
    expect(currentRouteStage({ status: 'draft', starts_at: '2026-09-25T16:00:00Z' }, games, now)).toBe('prepare');
    expect(currentRouteStage({ status: 'published', starts_at: '2026-09-25T16:00:00Z' }, games, now)).toBe('gather');
    expect(currentRouteStage({ status: 'published', starts_at: '2026-09-24T16:00:00Z' }, games, now)).toBe('day');
    expect(currentRouteStage({ status: 'active', starts_at: '2026-09-24T08:00:00Z' }, { total: 2, unfinished: 1 }, now)).toBe('live');
    expect(currentRouteStage({ status: 'active', starts_at: '2026-09-24T08:00:00Z' }, { total: 3, unfinished: 0 }, now)).toBe('closeout');
    expect(currentRouteStage({ status: 'completed', starts_at: '2026-09-24T08:00:00Z' }, games, now)).toBe('after');
  });

  it('returns stages with real step states for a published evening', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    const starts = new Date(Date.now() + 3 * 24 * HOUR).toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('r1','Пятница',?,'Europe/Moscow','CASUAL','published',20,100,?,?)`, [starts, now, now]);
    await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('p1','Аня',?,?),('p2','Борис',?,?)`, [now, now, now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,registration_status,response_status,attendance_status,payment_status,created_at,updated_at)
      VALUES ('e1','r1','p1','going','going','pending','unpaid',?,?),('e2','r1','p2','thinking','thinking','pending','unpaid',?,?)`, [now, now, now, now]);

    const response = await request(app).get('/api/evenings/r1/route').set('Cookie', organizerCookie());
    expect(response.status).toBe(200);
    expect(response.body.current_stage).toBe('gather');
    expect(response.body.stages.map((stage: any) => [stage.id, stage.state])).toEqual([
      ['prepare', 'done'], ['gather', 'current'], ['day', 'upcoming'], ['live', 'upcoming'], ['closeout', 'upcoming'], ['after', 'upcoming'],
    ]);
    const gather = response.body.stages.find((stage: any) => stage.id === 'gather');
    const answers = gather.steps.find((step: any) => step.id === 'answers');
    expect(answers.detail).toContain('Идут: 1');
    expect(answers.detail).toContain('думают: 1');
    expect(answers.status).toBe('attention');
    const prepare = response.body.stages.find((stage: any) => stage.id === 'prepare');
    expect(prepare.steps.find((step: any) => step.id === 'publish').status).toBe('done');

    expect((await request(app).get('/api/evenings/r1/route')).status).toBe(401);
  });
});
