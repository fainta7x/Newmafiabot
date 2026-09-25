import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import routes from '../server/routes/playerSplitVoteProgressRoutes.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { correctSplitVote } from '../lib/splitVoteTraining.ts';

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
});
