import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';

// 2026-11-20: on iPhones the VK app returns the login to Safari, not to the Telegram window that started it. The login
// is finished there and handed to the starting window only; the other browser gets no session.
const cookiePair = (setCookie: unknown, name: string) => {
  const values = Array.isArray(setCookie) ? setCookie.map(String) : setCookie ? [String(setCookie)] : [];
  const found = values.find((value) => value.startsWith(`${name}=`));
  return found ? found.split(';')[0] : null;
};

describe('VK login finished in another browser', () => {
  let db: DatabaseWrapper;
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); db?.sqlite.close(); });

  it('the starting window gets the session once; the browser where VK came back gets none', async () => {
    vi.stubEnv('VK_APP_ID', '123456');
    vi.stubEnv('JWT_SECRET', 'handoff-test-secret');
    vi.stubEnv('PLAYER_APP_URL', 'https://club.example');
    db = createDatabaseConnection(':memory:');
    const app = await createApp(db);
    await db.run("INSERT INTO players(id,nickname,tokens,created_at,updated_at) VALUES ('p1','Аннушка',0,'x','x')");
    await db.run("INSERT INTO player_external_identities(platform,external_user_id,player_id,linked_at,updated_at) VALUES ('vk','777','p1','x','x')");

    const start = await request(app).post('/api/integrations/player/vk/start').set('X-Forwarded-Proto', 'https').send({ return_to: '/player/telephone' });
    expect(start.body).toMatchObject({ authorize_url: expect.any(String) });
    const binding = cookiePair(start.headers['set-cookie'], 'vk_player_oauth_binding')!;
    expect(binding).toBeTruthy();
    const state = new URL(start.body.authorize_url).searchParams.get('state')!;

    // Nothing yet.
    expect((await request(app).post('/api/integrations/player/vk/handoff').set('Cookie', binding).send({ state })).body).toEqual({ status: 'pending' });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ access_token: 'x', user_id: 777, state }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    // VK came back in another browser (no binding cookie): a page, no session.
    const callback = await request(app).get(`/api/integrations/vk/oauth/callback?code=c&device_id=d&state=${state}`);
    expect(callback.status).toBe(200);
    expect(callback.text).toContain('Вход через VK подтверждён');
    expect(cookiePair(callback.headers['set-cookie'], 'player_token')).toBeNull();

    // Somebody else (no binding) cannot pick it up.
    expect((await request(app).post('/api/integrations/player/vk/handoff').send({ state })).body).toEqual({ status: 'unknown' });

    const claim = await request(app).post('/api/integrations/player/vk/handoff').set('Cookie', binding).send({ state });
    expect(claim.body).toEqual({ status: 'done', return_to: '/player/telephone' });
    const session = cookiePair(claim.headers['set-cookie'], 'player_token');
    expect(session).toBeTruthy();
    const me = await request(app).get('/api/auth/me').set('Cookie', session!);
    expect(me.body).toMatchObject({ linked: true, player: { id: 'p1' } });
    // Once.
    expect((await request(app).post('/api/integrations/player/vk/handoff').set('Cookie', binding).send({ state })).body).toEqual({ status: 'expired' });
  });
});
