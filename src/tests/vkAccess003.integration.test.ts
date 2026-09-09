import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import authRoutes from '../server/routes/authRoutes.ts';
import { parseUserSession } from '../server/auth.ts';
import vkPlayerStartRouter from '../server/services/vkPlayerStartRouter.ts';
import vkPlayerCallbackRouter from '../server/services/vkJoinRegistrationCallbackRouter.ts';

const bindingHash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function makeLinkedDb(binding: string) {
  let consumed = false;
  const run = vi.fn(async (sql: string) => {
    if (sql.includes('UPDATE vk_player_oauth_states') && sql.includes('consumed_at')) {
      if (consumed) return { changes: 0, lastID: null };
      consumed = true;
      return { changes: 1, lastID: null };
    }
    return { changes: 1, lastID: null };
  });
  const get = vi.fn(async (sql: string) => {
    if (sql.includes('FROM vk_player_oauth_states')) {
      if (consumed) return null;
      return {
        state: 'state-1',
        verifier: 'verifier-1',
        redirect_uri: 'https://club.example/api/integrations/vk/oauth/callback',
        nickname: 'Existing Player',
        return_to: '/player/rating?period=current',
        browser_binding_hash: bindingHash(binding),
        initiating_player_id: null,
        consumed_at: null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      };
    }
    if (sql.includes("FROM player_external_identities") && sql.includes("platform='vk'")) {
      return { player_id: 'player-existing' };
    }
    if (sql.includes('SELECT id FROM players WHERE id = ?')) return { id: 'player-existing' };
    if (sql.includes('SELECT id, nickname, full_name, telegram_username, elo, tokens')) {
      return { id: 'player-existing', nickname: 'Existing Player', full_name: null, telegram_username: null, elo: 1200, tokens: 0 };
    }
    if (sql.includes('FROM organizer_player_access')) return null;
    return null;
  });
  const all = vi.fn(async (sql: string) => {
    if (sql.includes('PRAGMA table_info(vk_player_oauth_states)')) {
      return [
        { name: 'browser_binding_hash' },
        { name: 'initiating_player_id' },
        { name: 'consumed_at' },
      ];
    }
    return [];
  });
  const db = {
    exec: vi.fn(async () => {}),
    run,
    get,
    all,
    transaction: vi.fn(),
    sqlite: {} as any,
    drizzle: {} as any,
    dbPath: ':memory:',
  } as unknown as DatabaseWrapper;
  return { db, run };
}

const makeApp = (db: DatabaseWrapper) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use(parseUserSession);
  app.use('/api/integrations', vkPlayerStartRouter);
  app.use('/api/integrations', vkPlayerCallbackRouter);
  app.use('/api/auth', authRoutes);
  return app;
};

const cookiePair = (setCookie: unknown, name: string) => {
  const values = Array.isArray(setCookie) ? setCookie.map(String) : setCookie ? [String(setCookie)] : [];
  const found = values.find((value) => value.startsWith(`${name}=`));
  return found ? found.split(';')[0] : null;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VK-ACCESS-003 production login', () => {
  it('linked VK callback issues canonical player_token and authenticates the existing cabinet profile', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'vk-access-003-test-secret');
    vi.stubEnv('VK_APP_ID', '123456');
    vi.stubEnv('PLAYER_APP_URL', 'https://club.example');
    const binding = 'abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890';
    const { db, run } = makeLinkedDb(binding);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      access_token: 'opaque-token',
      user_id: 777,
      state: 'state-1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const app = makeApp(db);
    const callback = await request(app)
      .get('/api/integrations/vk/oauth/callback?code=code-1&device_id=device-1&state=state-1')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', `vk_player_oauth_binding=${binding}`);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/player/rating?period=current');
    const playerCookie = cookiePair(callback.headers['set-cookie'], 'player_token');
    expect(playerCookie).toBeTruthy();
    expect(String(callback.headers['set-cookie'])).toContain('SameSite=Lax');
    expect(String(callback.headers['set-cookie'])).toContain('Secure');

    const me = await request(app).get('/api/auth/me').set('Cookie', playerCookie!);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ linked: true, player: { id: 'player-existing', nickname: 'Existing Player' } });
    expect(run.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO players'))).toBe(false);
  });

  it('writes a secure browser-binding cookie behind the production proxy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VK_APP_ID', '123456');
    vi.stubEnv('PLAYER_APP_URL', 'https://club.example');
    const db = {
      exec: vi.fn(async () => {}),
      run: vi.fn(async () => ({ changes: 1, lastID: null })),
      get: vi.fn(async (sql: string) => sql.includes('COUNT(*) AS count') ? { count: 0 } : null),
      all: vi.fn(async () => [{ name: 'browser_binding_hash' }, { name: 'initiating_player_id' }, { name: 'consumed_at' }]),
    } as unknown as DatabaseWrapper;
    const app = makeApp(db);
    const response = await request(app)
      .post('/api/integrations/player/vk/start')
      .set('X-Forwarded-Proto', 'https')
      .send({ nickname: 'Existing Player', return_to: '/player/games' });

    expect(response.status).toBe(200);
    const cookies = String(response.headers['set-cookie']);
    expect(cookies).toContain('vk_player_oauth_binding=');
    expect(cookies).toContain('Path=/api/integrations');
    expect(cookies).toContain('Secure');
    expect(cookies).toContain('SameSite=Lax');
    expect(new URL(response.body.authorize_url).searchParams.get('redirect_uri'))
      .toBe('https://club.example/api/integrations/vk/oauth/callback');
  });

  it('returns a safe explicit runtime code when trusted production origin is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VK_APP_ID', '123456');
    vi.stubEnv('PLAYER_APP_URL', '');
    vi.stubEnv('PUBLIC_APP_URL', '');
    const db = { get: vi.fn(), run: vi.fn(), exec: vi.fn(), all: vi.fn() } as unknown as DatabaseWrapper;
    const response = await request(makeApp(db))
      .post('/api/integrations/player/vk/start')
      .set('X-Forwarded-Proto', 'https')
      .send({ nickname: 'Existing Player', return_to: '/player' });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'public_origin_not_configured' });
    expect(String(response.body.error)).not.toContain('PLAYER_APP_URL');
  });

  it('keeps transient OAuth errors out of the next requested return path', () => {
    const source = fs.readFileSync('src/components/player/VkPlayerAccess.tsx', 'utf8');
    expect(source).toContain("['vk_error', 'vk_link_pending', 'vk_linked', 'vk_link_nickname']");
    expect(source).toContain('url.searchParams.delete(key)');
    expect(source).toContain("cache: 'no-store'");
  });

  it('keeps public vk_join_session isolated from canonical Player Cabinet authentication', () => {
    const source = fs.readFileSync('src/server/services/vkJoinRegistrationCallbackRouter.ts', 'utf8');
    const playerStart = source.indexOf('// Full player-cabinet VK ID flow uses the canonical player session only.');
    const publicStart = source.indexOf('// Existing public evening-registration VK flow remains unchanged.');
    const playerBranch = source.slice(playerStart, publicStart);
    expect(playerBranch).toContain('setPlayerSessionCookie');
    expect(playerBranch).not.toContain('setVkSessionCookie');
    expect(playerBranch).not.toContain("res.cookie('vk_join_session'");
  });
});
