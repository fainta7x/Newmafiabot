import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { generateOrganizerToken, generatePlayerSessionToken, parseUserSession } from '../server/auth.ts';
import developerTestModeRoutes from '../server/routes/developerTestModeRoutes.ts';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use(cookieParser());
  instance.use(parseUserSession);
  instance.use('/api/crm/test-mode', developerTestModeRoutes);
  return instance;
}

const organizerCookie = () => `organizer_token=${generateOrganizerToken()}`;

describe('developer test mode safety boundary', () => {
  it('rejects unauthenticated and player sessions', async () => {
    await request(app()).get('/api/crm/test-mode/session').expect(401);
    await request(app())
      .get('/api/crm/test-mode/session')
      .set('Cookie', `player_token=${generatePlayerSessionToken('player-test')}`)
      .expect(401);
  });

  it('creates only an in-memory labelled organizer session', async () => {
    const cookie = organizerCookie();
    const initial = await request(app()).get('/api/crm/test-mode/session').set('Cookie', cookie).expect(200);
    expect(initial.body.active).toBeNull();
    expect(initial.body.safety).toMatchObject({
      storage: 'memory-only',
      production_writes: false,
      database_mutations: false,
      real_evening_mutations: false,
    });

    const created = await request(app())
      .post('/api/crm/test-mode/session')
      .set('Cookie', cookie)
      .send({ scenario: 'voting' })
      .expect(201);

    expect(created.body.active).toMatchObject({
      label: '[TEST] Сессия организатора',
      scenario: 'voting',
      phase: 'voting',
      storage: 'memory-only',
      production_writes: false,
    });
    expect(created.body.active.id).toEqual(expect.any(String));
  });

  it('requires the exact active session id before reset', async () => {
    const cookie = organizerCookie();
    const created = await request(app())
      .post('/api/crm/test-mode/session')
      .set('Cookie', cookie)
      .send({ scenario: 'night' })
      .expect(201);

    await request(app())
      .delete('/api/crm/test-mode/session')
      .set('Cookie', cookie)
      .send({ session_id: 'wrong-session' })
      .expect(409);

    await request(app())
      .delete('/api/crm/test-mode/session')
      .set('Cookie', cookie)
      .send({ session_id: created.body.active.id })
      .expect(204);

    const after = await request(app()).get('/api/crm/test-mode/session').set('Cookie', cookie).expect(200);
    expect(after.body.active).toBeNull();
  });

  it('rejects unknown scenarios', async () => {
    await request(app())
      .post('/api/crm/test-mode/session')
      .set('Cookie', organizerCookie())
      .send({ scenario: 'real-production-evening' })
      .expect(400);
  });
});
