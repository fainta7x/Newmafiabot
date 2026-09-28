import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import routes from '../server/routes/playerSplitVoteProgressRoutes.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { correctSplitVote } from '../lib/splitVoteTraining.ts';
import { generateExpertExam, solveExpert } from '../lib/splitVoteExpert.ts';
import { correctSplitThreeVote, generateSplitThreeScenario, splitThreeAssignments } from '../lib/splitThreeTraining.ts';
import { generateSplitThreeBreak, generateSplitThreeChoice, splitThreeBreakState } from '../lib/splitThreeBreak.ts';
import { createDatabaseConnection } from '../db/index.ts';
import { ensureSplitVoteProgressSchema } from '../db/ensureSplitVoteProgressSchema.ts';

const scenario = { candidates: [1, 3], pair: [1, 3], seat: 2 };
const answers = [2, 4, 5, 6, 7].map((seat) => {
  const entry = { ...scenario, pair: [1, 3] as [number, number], seat };
  return { scenario: entry, answer: correctSplitVote(entry) };
});

describe('player split-vote progression', () => {
  const rows = new Map<string, Set<string>>();
  const db = {
    exec: async () => undefined,
    all: async (_sql: string, [playerId]: string[]) => [...(rows.get(playerId) ?? [])].map((level) => ({ level })),
    get: async (_sql: string, [playerId, level]: string[]) => rows.get(playerId)?.has(level) ? { passed: 1 } : undefined,
    run: async (_sql: string, [playerId, level]: string[]) => { const levels = rows.get(playerId) ?? new Set<string>(); levels.add(level); rows.set(playerId, levels); },
  };
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => { req.db = db as any; next(); });
  app.use('/api/player', routes);
  const cookie = (playerId: string) => `player_token=${generatePlayerSessionToken(playerId)}`;

  beforeEach(() => rows.clear());

  it('requires a player session and rejects incorrect exam answers', async () => {
    expect((await request(app).get('/api/player/split-vote-progress')).status).toBe(401);
    expect((await request(app).post('/api/player/split-vote-progress').send({ level: 'basic', answers })).status).toBe(401);
    const response = await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('alice'))
      .send({ level: 'basic', answers: [...answers.slice(0, 4), { ...answers[4], answer: answers[4].answer === 1 ? 3 : 1 }] });
    expect(response.status).toBe(400);
    expect(rows.size).toBe(0);
  });

  it('records a verified basic pass for one player and requires it for advanced', async () => {
    expect((await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('bob'))
      .send({ level: 'advanced', answers: [] })).status).toBe(400);
    const passed = await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('alice'))
      .send({ level: 'basic', answers });
    expect(passed.status).toBe(200);
    expect(passed.body.passed).toEqual(['basic']);
    expect((await request(app).get('/api/player/split-vote-progress').set('Cookie', cookie('bob'))).body.passed).toEqual([]);
    const advanced = [1, 2, 4, 6, 7].map((seat) => {
      const next = { ...scenario, seat, pair: [3, 5] as [number, number], candidates: [3, 5] };
      return { scenario: next, answer: correctSplitVote(next) };
    });
    expect((await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('bob'))
      .send({ level: 'advanced', answers: advanced })).status).toBe(403);
  });

  it('records the expert level only after the interactive one, with four of five tasks around №1', async () => {
    const exam = generateExpertExam();
    const answers = exam.map((scenario) => ({ scenario, answer: solveExpert(scenario)! }));
    expect((await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('carol'))
      .send({ level: 'expert', answers })).status).toBe(403);
    rows.set('carol', new Set(['basic', 'advanced', 'interactive']));
    const passed = await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('carol')).send({ level: 'expert', answers });
    expect(passed.status).toBe(200);
    expect(passed.body.passed).toContain('expert');

    const wrong = answers.map((entry, index) => (index === 0 ? { ...entry, answer: {} } : entry));
    rows.set('dave', new Set(['basic', 'advanced', 'interactive']));
    expect((await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('dave')).send({ level: 'expert', answers: wrong })).status).toBe(400);
  });

  it('opens the medium level only after the easy exam, on its own chain', async () => {
    const easy = Array.from({ length: 5 }, () => generateSplitThreeScenario('three_easy')).map((scenario) => ({ scenario, answer: correctSplitThreeVote(scenario) }));
    const medium = Array.from({ length: 5 }, () => generateSplitThreeScenario('three_medium')).map((scenario) => ({ scenario, answer: splitThreeAssignments(scenario) }));
    expect((await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('erin')).send({ level: 'three_medium', answers: medium })).status).toBe(403);
    // No zero-round exams are needed for this trainer.
    const passedEasy = await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('erin')).send({ level: 'three_easy', answers: easy });
    expect(passedEasy.status).toBe(200);
    const passedMedium = await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('erin')).send({ level: 'three_medium', answers: medium });
    expect(passedMedium.status).toBe(200);
    expect(passedMedium.body.passed).toEqual(expect.arrayContaining(['three_easy', 'three_medium']));
    const wrong = medium.map((entry, index) => (index === 2 ? { ...entry, answer: {} } : entry));
    expect((await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('erin')).send({ level: 'three_medium', answers: wrong })).status).toBe(400);
  });

  it('opens the hard three-way level only after the «Кого пилить» exam', async () => {
    const hard = Array.from({ length: 5 }, () => generateSplitThreeScenario('three_hard')).map((scenario) => ({ scenario, answer: splitThreeAssignments(scenario) }));
    expect((await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('fred')).send({ level: 'three_hard', answers: hard })).status).toBe(403);
    // The two-sheriffs level (shown as «Экспертный») now follows «Сложный» and «Кого пилить».
    rows.set('fred', new Set(['three_easy', 'three_medium', 'three_break', 'three_choose']));
    const passed = await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('fred')).send({ level: 'three_hard', answers: hard });
    expect(passed.status).toBe(200);
    expect(passed.body.passed).toContain('three_hard');
    // Passed before «Кого пилить» existed: a retake stays allowed.
    rows.set('fred2', new Set(['three_easy', 'three_medium', 'three_hard']));
    expect((await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('fred2')).send({ level: 'three_hard', answers: hard })).status).toBe(200);
    // A task without the sheriff claims is not a hard-level task.
    const stripped = hard.map((entry, index) => (index === 0 ? { ...entry, scenario: { ...entry.scenario, sheriffs: undefined } } : entry));
    expect((await request(app).post('/api/player/split-vote-progress').set('Cookie', cookie('fred')).send({ level: 'three_hard', answers: stripped })).status).toBe(400);
  });

  it('checks the broken-split exam and opens it after the medium exam', async () => {
    const post = (playerId: string, answers: unknown) => request(app).post('/api/player/split-vote-progress').set('Cookie', cookie(playerId)).send({ level: 'three_break', answers });
    const right = Array.from({ length: 5 }, () => generateSplitThreeBreak()).map((scenario) => ({ scenario, answer: { [scenario.breaker]: splitThreeBreakState(scenario).pool } }));
    expect((await post('gina', right)).status).toBe(403);
    rows.set('gina', new Set(['three_easy', 'three_medium']));
    expect((await post('gina', right)).status).toBe(200);
    // Sending the remaining hands to another split player instead of the breaker fails.
    const [first] = right;
    const other = first.scenario.split.find((seat) => seat !== first.scenario.breaker)!;
    rows.set('gil', new Set(['three_easy', 'three_medium']));
    expect((await post('gil', [{ ...first, answer: { [other]: splitThreeBreakState(first.scenario).pool } }, ...right.slice(1)])).status).toBe(400);
  });

  it('checks the «Кого пилить» exam', async () => {
    const post = (playerId: string, answers: unknown) => request(app).post('/api/player/split-vote-progress').set('Cookie', cookie(playerId)).send({ level: 'three_choose', answers });
    const tasks = Array.from({ length: 5 }, () => generateSplitThreeChoice());
    rows.set('hana', new Set(['three_easy', 'three_medium', 'three_break']));
    expect((await post('hana', tasks.map((scenario) => ({ scenario, answer: scenario.split })))).status).toBe(200);
    rows.set('ivan', new Set(['three_easy', 'three_medium', 'three_break']));
    const wrong = tasks.map((scenario, index) => ({ scenario, answer: index === 0 ? [scenario.sheriffs!.trusted.seat, ...scenario.split.slice(1)] : scenario.split }));
    expect((await post('ivan', wrong)).status).toBe(400);
  });
});

describe('split-vote progress table', () => {
  it('accepts the expert level on an old table and keeps passed exams', async () => {
    const db = createDatabaseConnection(':memory:');
    await db.exec(`CREATE TABLE player_split_vote_progress (
      player_id TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('basic', 'advanced', 'interactive')),
      passed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (player_id, level)
    )`);
    await db.run("INSERT INTO player_split_vote_progress (player_id, level, passed_at) VALUES ('p1', 'interactive', '2026-09-25 10:00:00')");
    // Two first requests at once must share one rebuild.
    await Promise.all([ensureSplitVoteProgressSchema(db), ensureSplitVoteProgressSchema(db)]);
    await ensureSplitVoteProgressSchema(db);
    await db.run("INSERT INTO player_split_vote_progress (player_id, level) VALUES ('p1', 'expert')");
    await db.run("INSERT INTO player_split_vote_progress (player_id, level) VALUES ('p1', 'three_medium')");
    await db.run("INSERT INTO player_split_vote_progress (player_id, level) VALUES ('p1', 'three_hard')");
    expect(await db.all("SELECT level, passed_at FROM player_split_vote_progress WHERE player_id = 'p1' ORDER BY level")).toEqual([
      { level: 'expert', passed_at: expect.any(String) },
      { level: 'interactive', passed_at: '2026-09-25 10:00:00' },
      { level: 'three_hard', passed_at: expect.any(String) },
      { level: 'three_medium', passed_at: expect.any(String) },
    ]);
    db.sqlite.close();
  });

  it('adds the hard three-way level to the table deployed with the medium level', async () => {
    const db = createDatabaseConnection(':memory:');
    await db.exec(`CREATE TABLE player_split_vote_progress (
      player_id TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('basic', 'advanced', 'interactive', 'expert', 'three_easy', 'three_medium')),
      passed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (player_id, level)
    )`);
    await db.run("INSERT INTO player_split_vote_progress (player_id, level, passed_at) VALUES ('p2', 'three_medium', '2026-09-26 10:00:00')");
    await ensureSplitVoteProgressSchema(db);
    await db.run("INSERT INTO player_split_vote_progress (player_id, level) VALUES ('p2', 'three_hard')");
    expect(await db.all("SELECT level, passed_at FROM player_split_vote_progress WHERE player_id = 'p2' ORDER BY level")).toEqual([
      { level: 'three_hard', passed_at: expect.any(String) },
      { level: 'three_medium', passed_at: '2026-09-26 10:00:00' },
    ]);
    db.sqlite.close();
  });
});
