import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDatabaseConnection } from '../db/index.ts';
import {
  SLOW_REQUEST_MS, SLOW_TRANSACTION_MS, performanceSnapshot, recordLoopWindow, recordSlowTransaction,
  requestFinished, requestStarted, resetPerformanceProbeForTesting, routeLabel, setSlowRequestThresholdForTesting,
  SLOW_JOB_SQLITE_MS, SLOW_QUERY_MS, recordSlowQuery, slowQueriesSnapshot, timeBackgroundJob,
} from '../lib/performanceProbe.ts';
import { performanceMiddleware, requestRouteLabel } from '../server/services/performanceWatchdog.ts';
import { createRuntimeHealthRoutes } from '../server/routes/runtimeHealthRoutes.ts';

afterEach(() => resetPerformanceProbeForTesting());

describe('the record of what made the server slow', () => {
  it('names routes without ids, tokens or numbers', () => {
    expect(routeLabel('GET', '/api/player/poker/lobbies/0b9d2c9e-1a2b-4c3d-8e9f-001122334455?x=1')).toBe('GET /api/player/poker/lobbies/:id');
    expect(routeLabel('POST', '/api/player/poker/tournaments/ptr_abc-123/register')).toBe('POST /api/player/poker/tournaments/:id/register');
    expect(routeLabel('GET', '/api/evenings/42/route')).toBe('GET /api/evenings/:id/route');
  });

  it('keeps only slow requests and slow transactions, newest worst first, and forgets them after five minutes', () => {
    const t0 = 1_000_000_000_000;
    const fast = requestStarted('GET /api/fast', t0); requestFinished(fast, 200, t0 + SLOW_REQUEST_MS - 1);
    const slow = requestStarted('GET /api/slow', t0); requestFinished(slow, 200, t0 + 6000);
    const slower = requestStarted('GET /api/slower', t0); requestFinished(slower, 500, t0 + 9000);
    recordSlowTransaction(10, SLOW_TRANSACTION_MS - 1, 'src/server/x.ts:1:1', t0);
    recordSlowTransaction(5000, 20, 'src/server/waiting.ts:3:4', t0);
    recordSlowTransaction(30, 7000, 'src/server/holding.ts:9:9', t0);
    recordLoopWindow({ max_ms: 4200, p99_ms: 300, mean_ms: 12 }, t0);
    const snapshot = performanceSnapshot(t0 + 10_000);
    expect(snapshot.slow_requests.map((item) => item.route)).toEqual(['GET /api/slower', 'GET /api/slow']);
    expect(snapshot.slow_transactions.map((item) => item.origin)).toEqual(['src/server/holding.ts:9:9', 'src/server/waiting.ts:3:4']);
    expect(snapshot.event_loop.worst_stall_ms).toBe(4200);
    expect(performanceSnapshot(t0 + 6 * 60_000).slow_requests).toEqual([]);
  });

  it('shows what is running while the server is stuck', () => {
    const t0 = 2_000_000_000_000;
    requestStarted('GET /api/stuck', t0);
    expect(performanceSnapshot(t0 + 8000).running_now).toEqual([{ route: 'GET /api/stuck', running_ms: 8000 }]);
  });

  it('measures real requests through the middleware and serves the aggregate without personal data', async () => {
    const app = express();
    app.use(performanceMiddleware);
    app.get('/api/slow/:id', (_req, res) => res.json({ ok: true }));
    app.use('/api/health', createRuntimeHealthRoutes());
    const running = await request(app).get('/api/health/performance');
    expect(running.status).toBe(200);
    expect(running.headers['cache-control']).toBe('no-store');
    expect(Object.keys(running.body)).toEqual(expect.arrayContaining(['event_loop', 'slow_requests', 'slow_transactions', 'running_now']));
    expect(JSON.stringify(running.body)).not.toMatch(/cookie|token|nickname/i);
  });

  it('never records a secret from a URL: only the matched route template, and no path at all when no route matched', async () => {
    setSlowRequestThresholdForTesting(0);
    const router = express.Router();
    router.get('/player/claim/:token', (_req, res) => { res.json({ ok: true }); });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    router.get('/public/broadcast/:token', async (_req, res) => { await gate; res.json({ ok: true }); });
    const app = express();
    app.use(performanceMiddleware);
    app.use('/api/integrations/vk', router);
    app.use('/api/health', createRuntimeHealthRoutes());

    await request(app).get('/api/integrations/vk/player/claim/SECRETCLAIMTOKEN123?code=SECRETQUERY');
    await request(app).get('/api/not-a-route/SECRETUNMATCHED456');
    // A request that is still running (the case during a freeze) is named by its template as well.
    const pending = request(app).get('/api/integrations/vk/public/broadcast/SECRETBROADCAST789').then((res) => res);
    await new Promise<void>((resolve) => { setTimeout(resolve, 50); });
    const during = await request(app).get('/api/health/performance');
    release();
    await pending;
    const after = await request(app).get('/api/health/performance');

    const everything = JSON.stringify([during.body, after.body]);
    expect(everything).not.toMatch(/SECRET/);
    expect(everything).toContain('GET /api/integrations/vk/player/claim/:token');
    expect(everything).toContain('GET /api/integrations/vk/public/broadcast/:token');
    expect(everything).toContain('GET (no route)');
    expect(during.body.running_now.map((item: { route: string }) => item.route)).toContain('GET /api/integrations/vk/public/broadcast/:token');
    expect(requestRouteLabel({ method: 'GET', baseUrl: '/x', route: undefined } as any)).toBe('GET (no route)');
  });

  it('records a transaction that waits behind another one', async () => {
    const db = createDatabaseConnection(':memory:');
    const holder = db.transaction(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, SLOW_TRANSACTION_MS + 100); }); });
    const waiter = db.transaction(async (tx) => { await tx.get('SELECT 1 AS one'); });
    await Promise.all([holder, waiter]);
    const { slow_transactions } = performanceSnapshot();
    expect(slow_transactions.some((item) => item.held_ms >= SLOW_TRANSACTION_MS)).toBe(true);
    expect(slow_transactions.some((item) => item.waited_ms >= SLOW_TRANSACTION_MS)).toBe(true);
    db.sqlite.close();
  });

  it('records a background job whose SQLite time blocked the server, and only that job', async () => {
    const db = createDatabaseConnection(':memory:');
    await db.exec('CREATE TABLE IF NOT EXISTS probe_numbers (n INTEGER)');
    const busy = async () => {
      // A recursive CTE keeps SQLite busy synchronously, like a heavy scan in a worker.
      const started = performance.now();
      while (performance.now() - started < SLOW_JOB_SQLITE_MS + 50) {
        await db.get('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 200000) SELECT COUNT(*) FROM c');
      }
    };
    await timeBackgroundJob('heavy_job', busy);
    await timeBackgroundJob('light_job', async () => { await db.get('SELECT 1'); });
    await db.get('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 200000) SELECT COUNT(*) FROM c');
    const { slow_jobs } = performanceSnapshot();
    expect(slow_jobs.map((item) => item.job)).toEqual(['heavy_job']);
    expect(slow_jobs[0].sqlite_ms).toBeGreaterThanOrEqual(SLOW_JOB_SQLITE_MS);
    expect(slow_jobs[0].sqlite_calls).toBeGreaterThan(0);
    db.sqlite.close();
  });

  it('records a job that blocks the server with plain JavaScript work, not one that only waits', async () => {
    await timeBackgroundJob('render_job', async () => {
      // Synchronous work outside SQLite (like drawing a picture) blocks the event loop just the same.
      const started = performance.now();
      let x = 0;
      while (performance.now() - started < SLOW_JOB_SQLITE_MS + 50) x += Math.sqrt(x + 1);
      return x;
    });
    await timeBackgroundJob('waiting_job', () => new Promise((resolve) => { setTimeout(resolve, SLOW_JOB_SQLITE_MS + 50); }));
    const { slow_jobs } = performanceSnapshot();
    expect(slow_jobs.map((item) => item.job)).toEqual(['render_job']);
    expect(slow_jobs[0].cpu_ms).toBeGreaterThanOrEqual(SLOW_JOB_SQLITE_MS);
    expect(slow_jobs[0].sqlite_ms).toBe(0);
  });

  it('counts a timed step towards the job around it and records the step with its own threshold', async () => {
    const db = createDatabaseConnection(':memory:');
    const heavy = 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 200000) SELECT COUNT(*) FROM c';
    await timeBackgroundJob('outer_job', async () => {
      await timeBackgroundJob('outer_job/step', async () => {
        const started = performance.now();
        while (performance.now() - started < SLOW_JOB_SQLITE_MS + 50) await db.get(heavy);
      }, 100);
    });
    const jobs = performanceSnapshot().slow_jobs.map((item) => item.job).sort();
    expect(jobs).toEqual(['outer_job', 'outer_job/step']);
    db.sqlite.close();
  });

  it('groups slow statements by their text, never their parameters, and orders them by total time', () => {
    recordSlowQuery('SELECT * FROM a\n   WHERE x = ?', SLOW_QUERY_MS + 10);
    recordSlowQuery('SELECT * FROM a WHERE x = ?', SLOW_QUERY_MS + 30);
    recordSlowQuery('SELECT * FROM b', SLOW_QUERY_MS + 100);
    expect(performanceSnapshot()).not.toHaveProperty('slow_queries');
    expect(slowQueriesSnapshot()).toEqual([
      { sql: 'SELECT * FROM b', count: 1, max_ms: SLOW_QUERY_MS + 100, total_ms: SLOW_QUERY_MS + 100 },
      { sql: 'SELECT * FROM a WHERE x = ?', count: 2, max_ms: SLOW_QUERY_MS + 30, total_ms: 2 * SLOW_QUERY_MS + 40 },
    ]);
  });
});

