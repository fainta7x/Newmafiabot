import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.ts', () => ({
  getIsolatedTestDb: async () => ({
    get: async () => ({ id: 'p-test-1' }),
  }),
}));

import testEnvironmentRoutes from '../server/routes/testEnvironmentRoutes.ts';

describe('single-app isolated test environment access', () => {
  const previousPassword = process.env.TEST_ACCESS_PASSWORD;

  beforeEach(() => {
    process.env.TEST_ACCESS_PASSWORD = 'safe-test-password';
  });

  afterEach(() => {
    process.env.TEST_ACCESS_PASSWORD = previousPassword;
  });

  function app() {
    const instance = express();
    instance.use(express.json());
    instance.use(cookieParser());
    instance.use('/api/test-environment', testEnvironmentRoutes);
    return instance;
  }

  it('reports the configured sandbox', async () => {
    const response = await request(app()).get('/api/test-environment/status');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ enabled: true, active: false });
  });

  it('creates one isolated player session cookie', async () => {
    const response = await request(app())
      .post('/api/test-environment/login')
      .send({ password: 'safe-test-password', role: 'player' });

    expect(response.status).toBe(200);
    expect(response.body.redirectTo).toBe('/player');
    const cookies = String(response.headers['set-cookie']);
    expect(cookies).toContain('test_environment_token=');
    expect(cookies).not.toContain('player_token=');
    expect(cookies).not.toContain('organizer_token=');
  });

  it('creates an organizer sandbox session without replacing production cookies', async () => {
    const response = await request(app())
      .post('/api/test-environment/login')
      .send({ password: 'safe-test-password', role: 'organizer' });

    expect(response.status).toBe(200);
    expect(response.body.redirectTo).toBe('/admin');
    expect(String(response.headers['set-cookie'])).toContain('test_environment_token=');
  });

  it('stays unavailable when no sandbox password is configured', async () => {
    delete process.env.TEST_ACCESS_PASSWORD;
    const response = await request(app())
      .post('/api/test-environment/login')
      .send({ password: 'safe-test-password', role: 'player' });

    expect(response.status).toBe(404);
  });
});
