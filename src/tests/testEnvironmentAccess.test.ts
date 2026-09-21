import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import testEnvironmentRoutes from '../server/routes/testEnvironmentRoutes.ts';

describe('isolated Amvera test environment access', () => {
  const previous = {
    appEnv: process.env.APP_ENV,
    password: process.env.TEST_ACCESS_PASSWORD,
  };

  beforeEach(() => {
    process.env.APP_ENV = 'test';
    process.env.TEST_ACCESS_PASSWORD = 'safe-test-password';
  });

  afterEach(() => {
    process.env.APP_ENV = previous.appEnv;
    process.env.TEST_ACCESS_PASSWORD = previous.password;
  });

  function app(playerExists = true) {
    const instance = express();
    instance.use(express.json());
    instance.use(cookieParser());
    instance.use((req, _res, next) => {
      req.db = {
        get: async () => playerExists ? { id: 'p-test-1' } : null,
      } as any;
      next();
    });
    instance.use('/api/test-environment', testEnvironmentRoutes);
    return instance;
  }

  it('reports the explicitly enabled test environment', async () => {
    const response = await request(app()).get('/api/test-environment/status');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ enabled: true, label: 'ТЕСТОВАЯ ВЕРСИЯ' });
  });

  it('creates a player-only session without organizer access', async () => {
    const response = await request(app())
      .post('/api/test-environment/login')
      .send({ password: 'safe-test-password', role: 'player' });

    expect(response.status).toBe(200);
    expect(response.body.redirectTo).toBe('/player');
    expect(response.headers['set-cookie'].join(';')).toContain('player_token=');
    expect(response.headers['set-cookie'].join(';')).toContain('organizer_token=;');
  });

  it('creates both player and organizer sessions for organizer entry', async () => {
    const response = await request(app())
      .post('/api/test-environment/login')
      .send({ password: 'safe-test-password', role: 'organizer' });

    expect(response.status).toBe(200);
    expect(response.body.redirectTo).toBe('/admin');
    const cookies = response.headers['set-cookie'].join(';');
    expect(cookies).toContain('player_token=');
    expect(cookies).toContain('organizer_token=');
  });

  it('stays unavailable outside APP_ENV=test', async () => {
    process.env.APP_ENV = 'production';
    const response = await request(app())
      .post('/api/test-environment/login')
      .send({ password: 'safe-test-password', role: 'player' });

    expect(response.status).toBe(404);
  });
});
