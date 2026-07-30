import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import * as schema from '../db/schema.ts';

describe('Bot Health Check API Integration Tests', () => {
  let app: any;
  let db: DatabaseWrapper;
  const originalEnvSecret = process.env.BOT_API_SECRET;

  beforeAll(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
  });

  afterEach(() => {
    // Restore environment variable after each test
    if (originalEnvSecret === undefined) {
      delete process.env.BOT_API_SECRET;
    } else {
      process.env.BOT_API_SECRET = originalEnvSecret;
    }
  });

  it('should return 503 if BOT_API_SECRET is not configured', async () => {
    delete process.env.BOT_API_SECRET;

    const res = await request(app)
      .get('/api/bot/health')
      .set('X-Bot-Token', 'some-token');

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('is not configured');
  });

  it('should return 401 if BOT_API_SECRET is configured but X-Bot-Token header is missing', async () => {
    process.env.BOT_API_SECRET = 'supersecretkey';

    const res = await request(app)
      .get('/api/bot/health');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Missing X-Bot-Token');
  });

  it('should return 401 if incorrect token is passed', async () => {
    process.env.BOT_API_SECRET = 'supersecretkey';

    const res = await request(app)
      .get('/api/bot/health')
      .set('X-Bot-Token', 'wrongtoken');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid X-Bot-Token');
  });

  it('should return 401 if correct token is passed but length differs', async () => {
    process.env.BOT_API_SECRET = 'supersecretkey';

    const res = await request(app)
      .get('/api/bot/health')
      .set('X-Bot-Token', 'short');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid X-Bot-Token');
  });

  it('should return 200 and expected JSON if correct token is passed', async () => {
    process.env.BOT_API_SECRET = 'supersecretkey';

    const res = await request(app)
      .get('/api/bot/health')
      .set('X-Bot-Token', 'supersecretkey');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      service: 'mafia-webapp',
      api_version: '1'
    });
    // Ensure response never contains the secret
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('supersecretkey');
  });

  it('should not modify any data in the database during health checks', async () => {
    process.env.BOT_API_SECRET = 'supersecretkey';

    const pBefore = await db.drizzle.select().from(schema.players);

    await request(app)
      .get('/api/bot/health')
      .set('X-Bot-Token', 'supersecretkey');

    const pAfter = await db.drizzle.select().from(schema.players);
    expect(pBefore.length).toBe(pAfter.length);
  });
});
