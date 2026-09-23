import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/auth.ts', () => ({ getPlayerSessionId: (req: any) => req.headers['x-player'] || null }));

const { default: routes } = await import('../server/routes/playerTournamentResultsRoutes.ts');

const makeApp = () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE tournaments (id TEXT PRIMARY KEY, title TEXT, date TEXT, venue TEXT, status TEXT, public_token TEXT, results_published_at TEXT);
    CREATE TABLE tournament_participants (id TEXT PRIMARY KEY, tournament_id TEXT, player_id TEXT);
    INSERT INTO tournaments VALUES
      ('t-old', 'Весенний кубок', '2026-04-01', 'Бар', 'completed', 'tok-old', '2026-04-02'),
      ('t-new', 'Осенний кубок', '2026-09-01', NULL, 'completed', 'tok-new', '2026-09-02'),
      ('t-draft', 'Черновик', '2026-09-10', NULL, 'completed', 'tok-draft', NULL),
      ('t-live', 'Идёт', '2026-09-20', NULL, 'in_progress', 'tok-live', NULL);
    INSERT INTO tournament_participants VALUES ('tp1', 't-old', 'p1');
  `);
  const app = express();
  app.use((req: any, _res, next) => {
    req.db = { all: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).all(...params) };
    next();
  });
  app.use('/api/player', routes);
  return app;
};

describe('GET /api/player/tournament-results', () => {
  it('requires a player session', async () => {
    expect((await request(makeApp()).get('/api/player/tournament-results')).status).toBe(401);
  });

  it('lists only published results, newest first, with the viewer participation flag', async () => {
    const response = await request(makeApp()).get('/api/player/tournament-results').set('x-player', 'p1');
    expect(response.status).toBe(200);
    expect(response.body.tournaments).toEqual([
      { id: 't-new', title: 'Осенний кубок', date: '2026-09-01', venue: null, results_path: '/tournaments/results/tok-new', participated: false },
      { id: 't-old', title: 'Весенний кубок', date: '2026-04-01', venue: 'Бар', results_path: '/tournaments/results/tok-old', participated: true },
    ]);
  });
});
