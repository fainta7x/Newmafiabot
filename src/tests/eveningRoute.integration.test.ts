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
    expect(currentRouteStage({ status: 'published', starts_at: '2026-09-24T16:00:00Z' }, games, now)).toBe('gather');
    expect(currentRouteStage({ status: 'active', starts_at: '2026-09-24T08:00:00Z' }, { total: 2, unfinished: 1 }, now)).toBe('live');
    expect(currentRouteStage({ status: 'active', starts_at: '2026-09-24T08:00:00Z' }, { total: 3, unfinished: 0 }, now)).toBe('closeout');
    // A closed evening has no stage of its own: it is the end of «Закрытие».
    expect(currentRouteStage({ status: 'completed', starts_at: '2026-09-24T08:00:00Z' }, games, now)).toBe('closeout');
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
      // Nothing was announced or sent yet, so the past «Подготовка» stays yellow, not «done».
      ['prepare', 'attention'], ['gather', 'current'], ['live', 'upcoming'], ['closeout', 'upcoming'],
    ]);
    const gather = response.body.stages.find((stage: any) => stage.id === 'gather');
    const answers = gather.steps.find((step: any) => step.id === 'answers');
    expect(answers.detail).toContain('Идут: 1');
    expect(answers.detail).toContain('думают: 1');
    // «Думаю» is an answer: nobody is silent, so the step is done (owner, 2026-10-02).
    expect(answers.status).toBe('done');
    const shortfall = gather.steps.find((step: any) => step.id === 'shortfall');
    expect(shortfall.status).toBe('attention');
    expect(shortfall.title).toMatch(/^Недобор: набрано 0 из 4 нужных игр/);
    expect(shortfall.detail).toContain('1-я 1/11');
    const prepare = response.body.stages.find((stage: any) => stage.id === 'prepare');
    expect(prepare.steps.find((step: any) => step.id === 'publish').status).toBe('done');
    expect(prepare.steps.map((step: any) => step.id)).toEqual(expect.arrayContaining(['timing', 'staff', 'tables', 'posts', 'invites']));
    expect(prepare.steps.find((step: any) => step.id === 'timing').detail).toContain('МСК');
    expect(prepare.steps.find((step: any) => step.id === 'posts').detail).toContain('План:');
    expect(prepare.steps.find((step: any) => step.id === 'posts').target).toBeUndefined();
    expect(prepare.steps.find((step: any) => step.id === 'invites').target).toBe('participants');
    expect(gather.steps.map((step: any) => step.id)).toContain('start');
    expect(response.body.stages.find((stage: any) => stage.id === 'closeout').steps.map((step: any) => step.id)).toContain('cancel');

    expect((await request(app).get('/api/evenings/r1/route')).status).toBe(401);
  });

  it('keeps the route short: no «created» step, no stage after closing, blockers named in the closing step (owner, 2026-10-06)', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    const started = new Date(Date.now() - 2 * HOUR).toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('c1','Пятница',?,'Europe/Moscow','CASUAL','active',20,100,?,?),('c2','Прошлая',?,'Europe/Moscow','CASUAL','completed',20,100,?,?)`, [started, now, now, started, now, now]);
    await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('p1','Аня',?,?)`, [now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,registration_status,response_status,attendance_status,payment_status,created_at,updated_at)
      VALUES ('e1','c1','p1','going','going','pending','unpaid',?,?)`, [now, now]);

    const open = (await request(app).get('/api/evenings/c1/route').set('Cookie', organizerCookie())).body;
    expect(open.stages.map((stage: any) => stage.id)).toEqual(['prepare', 'gather', 'live', 'closeout']);
    expect(open.stages.flatMap((stage: any) => stage.steps).some((step: any) => step.id === 'created')).toBe(false);
    expect(open.stages.find((stage: any) => stage.id === 'closeout').steps.map((step: any) => step.id)).toEqual(['money', 'close']);
    expect(open.stages.find((stage: any) => stage.id === 'closeout').steps.find((step: any) => step.id === 'close').detail).toContain('нет отметки у 1 игрок');

    const closed = (await request(app).get('/api/evenings/c2/route').set('Cookie', organizerCookie())).body;
    const close = closed.stages.find((stage: any) => stage.id === 'closeout').steps.find((step: any) => step.id === 'close');
    expect(close).toMatchObject({ title: 'Вечер закрыт', status: 'done' });
    // Every stage of a closed evening is behind it.
    expect(closed.stages.every((stage: any) => stage.state === 'done' || stage.state === 'attention')).toBe(true);
  });
});

