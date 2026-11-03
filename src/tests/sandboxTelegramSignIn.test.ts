import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

const { previousSecret, previousBot } = vi.hoisted(() => {
  const state = { previousSecret: process.env.JWT_SECRET, previousBot: process.env.TELEGRAM_BOT_TOKEN };
  process.env.JWT_SECRET = `test-${Math.random().toString(36).slice(2)}`;
  process.env.TELEGRAM_BOT_TOKEN = '123:test-bot-token';
  return state;
});
afterAll(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  if (previousBot === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previousBot;
});

import authRoutes from '../server/routes/authRoutes.ts';
import { generatePlayerSessionToken, parseUserSession, testEnvironmentPlayerId } from '../server/auth.ts';

const initData = () => {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 777, first_name: 'Чагин' }) });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN!).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
};

const makeApp = (db: any) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => { (req as any).db = db; next(); });
  app.use(parseUserSession);
  app.use('/api/auth', authRoutes);
  return app;
};

describe('Telegram sign-in inside the test environment (owner, 2026-11-03)', () => {
  it('keeps the sandbox session: no cookie is replaced or cleared and the database is not read', async () => {
    const db = { get: vi.fn(), run: vi.fn(), all: vi.fn(), exec: vi.fn() };
    const sandbox = generatePlayerSessionToken(testEnvironmentPlayerId('p-test-1'));
    const response = await request(makeApp(db)).post('/api/auth/telegram').set('Cookie', [`player_token=${sandbox}`]).send({ initData: initData() });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ linked: true, sandbox: true });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(db.get).not.toHaveBeenCalled();
  });

  it('outside the sandbox signs the player in as before', async () => {
    const db = { get: vi.fn(async () => ({ id: 'p-real', nickname: 'Чагин' })), run: vi.fn(), all: vi.fn(), exec: vi.fn() };
    const response = await request(makeApp(db)).post('/api/auth/telegram').send({ initData: initData() });
    expect(response.status).toBe(200);
    expect(response.body.linked).toBe(true);
    expect(String(response.headers['set-cookie'])).toContain('player_token=');
  });
});
