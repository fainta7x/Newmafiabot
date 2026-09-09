import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import vkPlayerStartRouter from '../server/services/vkPlayerStartRouter.ts';
import { resolveTrustedPublicAppOrigin } from '../server/services/publicAppOriginService.ts';
import { linkVkIdentity } from '../server/services/vkEveningIntegrationService.ts';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

function makeStartDb() {
  return {
    exec: vi.fn(async () => {}),
    run: vi.fn(async () => ({ changes: 1, lastID: null })),
    get: vi.fn(async (sql: string) => {
      if (sql.includes('COUNT(*) AS count FROM vk_player_oauth_states')) return { count: 0 };
      return null;
    }),
    all: vi.fn(async () => []),
    transaction: vi.fn(),
    sqlite: {} as any,
    drizzle: {} as any,
    dbPath: ':memory:',
  } as unknown as DatabaseWrapper;
}

afterEach(() => vi.unstubAllEnvs());

describe('VK-ACCESS-002 operational contracts', () => {
  it('serves the exact Player Cabinet VK OAuth start URL used by the UI', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VK_APP_ID', '123456');
    vi.stubEnv('PLAYER_APP_URL', 'https://club.example');
    const db = makeStartDb();
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req, _res, next) => { req.db = db; next(); });
    app.use('/api/integrations', vkPlayerStartRouter);
    app.use('/api/{*splat}', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));

    const response = await request(app)
      .post('/api/integrations/player/vk/start')
      .send({ nickname: 'VK Test', return_to: '/player/rating' });

    expect(response.status).toBe(200);
    expect(response.body.authorize_url).toContain('https://id.vk.com/authorize?');
    expect(response.body.return_to).toBe('/player/rating');
    const authorize = new URL(response.body.authorize_url);
    expect(authorize.searchParams.get('redirect_uri')).toBe('https://club.example/api/integrations/vk/oauth/callback');
    expect(String(response.headers['set-cookie'] || '')).toContain('vk_player_oauth_binding=');
  });

  it('keeps cabinet OAuth and public evening VK registration as separate mounts', () => {
    const appSource = read('src/app.ts');
    const playerRouter = read('src/server/services/vkPlayerStartRouter.ts');
    const publicRouter = read('src/server/services/vkJoinStartRouter.ts');
    expect(appSource).toContain("app.use('/api/integrations', vkPlayerStartRouter)");
    expect(appSource).toContain("app.use('/api/public', vkJoinStartRouter)");
    expect(playerRouter).toContain("router.post('/player/vk/start'");
    expect(publicRouter).toContain("router.post('/evenings/:id/vk/start'");
    expect(publicRouter).not.toContain("router.post('/player/vk/start'");
    expect(publicRouter).not.toContain('setPlayerSessionCookie');
  });

  it('starts the durable VK worker during normal app bootstrap after schema readiness', () => {
    const source = read('src/app.ts');
    const ensureIndex = source.indexOf('await ensureVkPersonalMessageSchema(db)');
    const testGuardIndex = source.indexOf('if (!isTest)');
    const workerIndex = source.indexOf('startVkMessageOutboxWorker(db)');
    expect(ensureIndex).toBeGreaterThanOrEqual(0);
    expect(testGuardIndex).toBeGreaterThan(ensureIndex);
    expect(workerIndex).toBeGreaterThan(testGuardIndex);
    const outbox = read('src/server/services/vkMessageOutboxService.ts');
    const workerBody = outbox.slice(outbox.indexOf('export function startVkMessageOutboxWorker'));
    expect(workerBody).toContain('kickVkMessageOutbox(db)');
    expect(workerBody.indexOf('kickVkMessageOutbox(db)')).toBeLessThan(workerBody.indexOf('setInterval'));
  });

  it('uses configured public origin in production and never trusts Host there', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PLAYER_APP_URL', 'https://canonical.example/some/path');
    expect(resolveTrustedPublicAppOrigin({ protocol: 'https', get: () => 'evil.example' } as any)).toBe('https://canonical.example');
    vi.stubEnv('PLAYER_APP_URL', 'http://canonical.example');
    expect(() => resolveTrustedPublicAppOrigin({ protocol: 'https', get: () => 'evil.example' } as any)).toThrow(/HTTPS/);
  });

  it('rejects linking a VK identity owned by another canonical player before any write', async () => {
    const run = vi.fn(async () => ({ changes: 1, lastID: null }));
    const db = {
      run,
      get: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT id, nickname FROM players')) return { id: 'owner', nickname: 'Owner' };
        if (sql.includes("platform='vk' AND external_user_id")) return { player_id: 'other-player' };
        if (sql.includes("platform='vk' AND player_id")) return null;
        return null;
      }),
    } as unknown as DatabaseWrapper;
    await expect(linkVkIdentity(db, { vkUserId: '777', playerId: 'owner' })).rejects.toMatchObject({ statusCode: 409 });
    expect(run).not.toHaveBeenCalled();
  });

  it('exposes VK linking only through owner settings', () => {
    const hub = read('src/components/player/PlayerProfileHub.tsx');
    const settings = read('src/components/player/PlayerNotificationSettings.tsx');
    const canonicalProfile = read('src/components/player/CanonicalPremiumPlayerProfile.tsx');
    expect(hub).toContain('<PlayerNotificationSettings nickname={player.nickname} />');
    expect(settings).toContain('Связать VK');
    expect(settings).toContain("fetch('/api/integrations/player/vk/start'");
    expect(canonicalProfile).not.toContain('PlayerNotificationSettings');
  });
});
