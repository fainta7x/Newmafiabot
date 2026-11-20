import { describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { cookieCsrfProtection } from '../server/middleware/cookieCsrfProtection.ts';

function fixture() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(cookieCsrfProtection);
  let writes = 0;
  app.get('/read', (_req, res) => res.json({ ok: true }));
  app.post('/write', (_req, res) => { writes += 1; res.json({ ok: true }); });
  app.post('/api/public/welcome/booking', (_req, res) => res.json({ ok: true }));
  return { app, writes: () => writes };
}

describe('browser cookie writes require a trusted origin or explicit CSRF proof', () => {
  for (const cookie of ['organizer_token=organizer', 'player_token=player']) {
    for (const origin of ['https://evil.example', 'https://untrusted.2lamafia.ru', 'null']) {
      it(`rejects ${origin} for ${cookie.split('=')[0]}`, async () => {
        const f = fixture();
        const result = await request(f.app).post('/write').set('Host', 'app.2lamafia.ru').set('Cookie', cookie).set('Origin', origin);
        expect(result.status).toBe(403);
        expect(f.writes()).toBe(0);
      });
    }
  }

  it('accepts the current application origin and issues a host-only secure token cookie', async () => {
    const f = fixture();
    const result = await request(f.app).post('/write').set('Host', 'app.2lamafia.ru').set('X-Forwarded-Proto', 'https').set('Cookie', 'organizer_token=organizer').set('Origin', 'https://app.2lamafia.ru');
    expect(result.status).toBe(200);
    const cookie = result.headers['set-cookie'][0];
    expect(cookie).toMatch(/^csrf_token=[a-f0-9]{64};/);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Domain=');
    expect(f.writes()).toBe(1);
  });

  it('accepts a matching explicit token, and rejects a mismatched one', async () => {
    const f = fixture();
    const cookie = `organizer_token=organizer; csrf_token=${'a'.repeat(64)}`;
    expect((await request(f.app).post('/write').set('Cookie', cookie).set('Origin', 'https://evil.example').set('X-CSRF-Token', 'b'.repeat(64))).status).toBe(403);
    expect((await request(f.app).post('/write').set('Cookie', cookie).set('Origin', 'https://evil.example').set('X-CSRF-Token', 'a'.repeat(64))).status).toBe(200);
    expect(f.writes()).toBe(1);
  });

  it('rejects cross-site fetch metadata and permits a same-origin browser without Origin', async () => {
    const f = fixture();
    for (const site of ['cross-site', 'same-site', 'none']) {
      expect((await request(f.app).post('/write').set('Cookie', 'player_token=player').set('Sec-Fetch-Site', site)).status).toBe(403);
    }
    expect((await request(f.app).post('/write').set('Cookie', 'player_token=player').set('Sec-Fetch-Site', 'same-origin')).status).toBe(200);
    expect(f.writes()).toBe(1);
  });

  it('uses Referer when modern browser headers are absent and rejects malformed origins', async () => {
    const f = fixture();
    for (const referer of ['https://evil.example/form', 'invalid']) {
      expect((await request(f.app).post('/write').set('Cookie', 'player_token=player').set('Referer', referer)).status).toBe(403);
    }
    expect((await request(f.app).post('/write').set('Cookie', 'player_token=player').set('Referer', 'https://app.2lamafia.ru/player')).status).toBe(200);
    expect(f.writes()).toBe(1);
  });

  it('does not mistake public/bearer writes or non-browser API clients for cookie CSRF', async () => {
    const f = fixture();
    expect((await request(f.app).post('/write').set('Origin', 'https://2lamafia.ru').set('Authorization', 'Bearer public-guest-secret')).status).toBe(200);
    expect((await request(f.app).post('/write').set('Cookie', 'organizer_token=organizer')).status).toBe(200);
    expect((await request(f.app).get('/read').set('Cookie', 'player_token=player').set('Origin', 'https://elsewhere.example')).status).toBe(200);
    const publicWrite = await request(f.app).post('/api/public/welcome/booking').set('Cookie', 'player_token=player').set('Origin', 'https://2lamafia.ru').set('Authorization', 'Bearer public-guest-secret');
    expect(publicWrite.status).toBe(200);
    expect(publicWrite.headers['set-cookie']).toBeUndefined();
    expect(f.writes()).toBe(2);
  });
});
