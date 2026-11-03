import crypto from 'node:crypto';
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

// The /telegram handler of the auth router, called directly with a request carrying the given cookie.
const telegramHandler = (authRoutes as any).stack.find((layer: any) => layer.route?.path === '/telegram' && layer.route.methods.post).route.stack.at(-1).handle;
const call = async (db: any, playerToken?: string) => {
  const req: any = { body: { initData: initData() }, cookies: playerToken ? { player_token: playerToken } : {}, headers: {}, db };
  await parseUserSession(req, {} as any, () => {});
  const cookies: string[] = [];
  let body: any; let status = 200;
  const res: any = {
    cookie: (name: string) => { cookies.push(name); return res; }, clearCookie: (name: string) => { cookies.push(`cleared:${name}`); return res; },
    status: (code: number) => { status = code; return res; }, json: (value: any) => { body = value; return res; },
  };
  await telegramHandler(req, res);
  return { status, body, cookies };
};

describe('Telegram sign-in inside the test environment (owner, 2026-11-03)', () => {
  it('keeps the sandbox session: no cookie is replaced or cleared and the database is not read', async () => {
    const db = { get: vi.fn(), run: vi.fn(), all: vi.fn(), exec: vi.fn() };
    const sandbox = generatePlayerSessionToken(testEnvironmentPlayerId('p-test-1'));
    const response = await call(db, sandbox);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ linked: true, sandbox: true });
    expect(response.cookies).toEqual([]);
    expect(db.get).not.toHaveBeenCalled();
  });

  it('outside the sandbox signs the player in as before', async () => {
    const db = { get: vi.fn(async () => ({ id: 'p-real', nickname: 'Чагин' })), run: vi.fn(), all: vi.fn(), exec: vi.fn() };
    const response = await call(db);
    expect(response.status).toBe(200);
    expect(response.body.linked).toBe(true);
    expect(response.cookies).toContain('player_token');
  });
});
