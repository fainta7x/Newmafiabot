import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.ts', () => ({
  getIsolatedTestDb: async () => ({
    get: async () => ({ id: 'p-test-1' }),
  }),
}));
vi.mock('../server/services/playerRegistrationService.ts', () => ({
  PlayerRegistrationError: class PlayerRegistrationError extends Error {
    status = 400;
    code = 'test_error';
  },
  registerNewPlayer: vi.fn(async () => ({
    created: true,
    player: { id: 'p-new-test', nickname: 'Новый тест' },
  })),
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

  it('switches the current browser session to the isolated player', async () => {
    const response = await request(app())
      .post('/api/test-environment/login')
      .send({ password: 'safe-test-password', role: 'player' });

    expect(response.status).toBe(200);
    expect(response.body.redirectTo).toBe('/player');
    const cookies = String(response.headers['set-cookie']);
    expect(cookies).toContain('player_token=');
    expect(cookies).toContain('organizer_token=;');
  });

  it('switches the current browser session to the isolated organizer', async () => {
    const response = await request(app())
      .post('/api/test-environment/login')
      .send({ password: 'safe-test-password', role: 'organizer' });

    expect(response.status).toBe(200);
    expect(response.body.redirectTo).toBe('/admin');
    const cookies = String(response.headers['set-cookie']);
    expect(cookies).toContain('player_token=');
    expect(cookies).toContain('organizer_token=');
  });

  it('registers a new player inside the isolated sandbox', async () => {
    const response = await request(app())
      .post('/api/test-environment/register')
      .send({ password: 'safe-test-password', nickname: 'Новый новичок', fullName: 'Тестовый новичок' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ created: true, redirectTo: '/player' });
    expect(String(response.headers['set-cookie'])).toContain('player_token=');
    expect(String(response.headers['set-cookie'])).toContain('organizer_token=;');
  });

  it('stays unavailable when no sandbox password is configured', async () => {
    delete process.env.TEST_ACCESS_PASSWORD;
    const response = await request(app())
      .post('/api/test-environment/login')
      .send({ password: 'safe-test-password', role: 'player' });

    expect(response.status).toBe(404);
  });
});
