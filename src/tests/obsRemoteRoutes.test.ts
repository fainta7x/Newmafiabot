import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { resetObsRemoteRateLimitsForTests } from '../server/routes/obsRemoteRoutes.ts';

describe('OBS remote bridge routes', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let db: DatabaseWrapper;
  let cookie: string;

  beforeEach(async () => {
    resetObsRemoteRateLimitsForTests();
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    cookie = `organizer_token=${generateOrganizerToken()}`;
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('pairs a laptop with a one-time expiring code and reports OBS state', async () => {
    await request(app).get('/api/obs-remote/status').expect(401);

    const codeResponse = await request(app)
      .post('/api/obs-remote/pairing-code')
      .set('Cookie', cookie)
      .expect(200);
    expect(codeResponse.body.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    await request(app)
      .post('/api/public/obs-bridge/pair')
      .send({ code: 'AAAAAAAA' })
      .expect(400);

    const pairResponse = await request(app)
      .post('/api/public/obs-bridge/pair')
      .send({ code: codeResponse.body.code.toLowerCase() })
      .expect(200);
    expect(pairResponse.body.bridge_token).toMatch(/^[A-Za-z0-9_-]+$/);

    await request(app)
      .post('/api/public/obs-bridge/pair')
      .send({ code: codeResponse.body.code })
      .expect(400);

    await request(app)
      .post('/api/public/obs-bridge/heartbeat')
      .set('Authorization', `Bearer ${pairResponse.body.bridge_token}`)
      .send({
        obs_connected: true,
        obs_version: '32.0.1',
        websocket_version: '5.6.2',
        current_scene: 'Стол',
        stream_active: true,
        recording_active: false,
        scenes: ['Заставка', 'Стол', 'Комментаторы'],
        audio_inputs: [{ name: 'Микрофон зала', muted: false }],
      })
      .expect(200, { commands: [] });

    const status = await request(app)
      .get('/api/obs-remote/status')
      .set('Cookie', cookie)
      .expect(200);
    expect(status.headers['cache-control']).toContain('no-store');
    expect(status.body).toMatchObject({
      paired: true,
      bridge_online: true,
      obs_connected: true,
      obs_version: '32.0.1',
      websocket_version: '5.6.2',
      current_scene: 'Стол',
      stream_active: true,
      recording_active: false,
    });
  });

  it('carries phone buttons to the laptop on its next heartbeat', async () => {
    const code = await request(app).post('/api/obs-remote/pairing-code').set('Cookie', cookie);
    const { body: { bridge_token: token } } = await request(app).post('/api/public/obs-bridge/pair').send({ code: code.body.code });
    // Nothing is queued while OBS is not connected.
    await request(app).post('/api/obs-remote/command').set('Cookie', cookie).send({ type: 'scene', scene: 'Стол' }).expect(409);
    const beat = (extra: Record<string, unknown> = {}) => request(app).post('/api/public/obs-bridge/heartbeat').set('Authorization', `Bearer ${token}`)
      .send({ obs_connected: true, current_scene: 'Заставка', scenes: ['Заставка', 'Стол'], audio_inputs: [{ name: 'Микрофон зала', muted: false }], ...extra });
    await beat().expect(200, { commands: [] });

    await request(app).post('/api/obs-remote/command').send({ type: 'scene', scene: 'Стол' }).expect(401);
    await request(app).post('/api/obs-remote/command').set('Cookie', cookie).send({ type: 'scene', scene: 'Нет такой' }).expect(409);
    await request(app).post('/api/obs-remote/command').set('Cookie', cookie).send({ type: 'delete-everything' }).expect(400);
    await request(app).post('/api/obs-remote/command').set('Cookie', cookie).send({ type: 'scene', scene: 'Стол' }).expect(202);
    await request(app).post('/api/obs-remote/command').set('Cookie', cookie).send({ type: 'mute', input: 'Микрофон зала', muted: true }).expect(202);
    await request(app).post('/api/obs-remote/command').set('Cookie', cookie).send({ type: 'stream', action: 'start' }).expect(202);

    const taken = await beat().expect(200);
    expect(taken.body.commands).toEqual([
      expect.objectContaining({ type: 'scene', scene: 'Стол' }),
      expect.objectContaining({ type: 'mute', input: 'Микрофон зала', muted: true }),
      expect.objectContaining({ type: 'stream', action: 'start' }),
    ]);
    // Each command is handed over once.
    await beat().expect(200, { commands: [] });
    const status = await request(app).get('/api/obs-remote/status').set('Cookie', cookie);
    expect(status.body.scenes).toEqual(['Заставка', 'Стол']);
    expect(status.body.audio_inputs).toEqual([{ name: 'Микрофон зала', muted: false }]);
  });

  it('expires pairing codes and revokes the bridge token', async () => {
    const codeResponse = await request(app)
      .post('/api/obs-remote/pairing-code')
      .set('Cookie', cookie)
      .expect(200);
    await db.run("UPDATE obs_remote_connections SET pairing_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = 'main'");
    await request(app).post('/api/public/obs-bridge/pair').send({ code: codeResponse.body.code }).expect(400);

    const freshCode = await request(app).post('/api/obs-remote/pairing-code').set('Cookie', cookie);
    const paired = await request(app).post('/api/public/obs-bridge/pair').send({ code: freshCode.body.code });
    await request(app).post('/api/obs-remote/revoke').set('Cookie', cookie).expect(204);
    await request(app)
      .post('/api/public/obs-bridge/heartbeat')
      .set('Authorization', `Bearer ${paired.body.bridge_token}`)
      .send({ obs_connected: true })
      .expect(401);

    const status = await request(app).get('/api/obs-remote/status').set('Cookie', cookie);
    expect(status.body).toMatchObject({ paired: false, bridge_online: false, obs_connected: false });
  });

  it('rate-limits repeated public pairing attempts', async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app)
        .post('/api/public/obs-bridge/pair')
        .set('X-Forwarded-For', '203.0.113.50')
        .send({ code: 'AAAAAAAA' })
        .expect(400);
    }

    await request(app)
      .post('/api/public/obs-bridge/pair')
      .set('X-Forwarded-For', '203.0.113.50')
      .send({ code: 'AAAAAAAA' })
      .expect(429, { error: 'Слишком много попыток подключения. Попробуйте позже.' });
  });
});
