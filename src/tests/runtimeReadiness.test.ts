import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import { createRuntimeHealthRoutes } from '../server/routes/runtimeHealthRoutes.ts';

const fakeResponse = (status: number, body: unknown, asText = false) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (asText) throw new Error('not json');
    return body;
  },
  text: async () => typeof body === 'string' ? body : JSON.stringify(body),
}) as Response;

const makeFetcher = (options: { botStatus?: number; webhookUrl?: string } = {}) => vi.fn(async (input: string | URL | Request) => {
  const url = String(input);
  if (url === 'http://127.0.0.1:8081/health') return fakeResponse(options.botStatus ?? 200, 'OK', true);
  if (url.endsWith('/getMe')) return fakeResponse(200, { ok: true, result: { id: 123, username: 'club_bot' } });
  if (url.endsWith('/getWebhookInfo')) {
    return fakeResponse(200, {
      ok: true,
      result: {
        url: options.webhookUrl ?? 'https://club.example.com/webhook',
        pending_update_count: 0,
      },
    });
  }
  return fakeResponse(404, { error: 'unexpected URL' });
});

const makeApp = (db: Pick<DatabaseWrapper, 'get'>, fetcher: ReturnType<typeof makeFetcher>) => {
  const app = express();
  app.use((req, _res, next) => {
    req.db = db as DatabaseWrapper;
    next();
  });
  app.use('/api/health', createRuntimeHealthRoutes(fetcher));
  return app;
};

const makeDb = (implementation: () => Promise<unknown>) => {
  const get = vi.fn(implementation);
  return { db: { get } as unknown as Pick<DatabaseWrapper, 'get'>, get };
};

describe('Public runtime readiness endpoint', () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalBotServiceUrl = process.env.BOT_SERVICE_URL;
  const originalWebhookUrl = process.env.WEBHOOK_URL;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = '123:runtime-secret';
    process.env.BOT_SERVICE_URL = 'http://127.0.0.1:8081';
    process.env.WEBHOOK_URL = 'https://club.example.com';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalBotServiceUrl === undefined) delete process.env.BOT_SERVICE_URL;
    else process.env.BOT_SERVICE_URL = originalBotServiceUrl;
    if (originalWebhookUrl === undefined) delete process.env.WEBHOOK_URL;
    else process.env.WEBHOOK_URL = originalWebhookUrl;
  });

  it('returns 200 only when database, bot and Telegram are healthy', async () => {
    const { db, get } = makeDb(async () => ({ ok: 1 }));
    const fetcher = makeFetcher();
    const app = makeApp(db, fetcher);
    const response = await request(app).get('/api/health/runtime');
    const cachedResponse = await request(app).get('/api/health/runtime');

    expect(response.status).toBe(200);
    expect(cachedResponse.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.status).toBe('ok');
    expect(response.body.checks).toEqual({ database: 'ok', bot: 'ok', telegram: 'ok' });
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith('SELECT 1 AS ok');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('returns a safe 503 response when Turso is unavailable', async () => {
    const { db } = makeDb(async () => { throw new Error('libsql://private-db.example/token'); });
    const response = await request(makeApp(db, makeFetcher())).get('/api/health/runtime');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.checks).toEqual({ database: 'fail', bot: 'ok', telegram: 'ok' });
    expect(JSON.stringify(response.body)).not.toContain('private-db');
  });

  it('returns 503 when the internal Python bot is unavailable', async () => {
    const { db } = makeDb(async () => ({ ok: 1 }));
    const response = await request(makeApp(db, makeFetcher({ botStatus: 503 }))).get('/api/health/runtime');

    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({ database: 'ok', bot: 'fail', telegram: 'ok' });
  });

  it('returns 503 without exposing token or webhook URL when Telegram is misconfigured', async () => {
    const { db } = makeDb(async () => ({ ok: 1 }));
    const response = await request(makeApp(db, makeFetcher({ webhookUrl: 'https://wrong.example.com/webhook' })))
      .get('/api/health/runtime');

    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({ database: 'ok', bot: 'ok', telegram: 'fail' });
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('runtime-secret');
    expect(body).not.toContain('wrong.example.com');
    expect(body).not.toContain('club.example.com');
  });
});
