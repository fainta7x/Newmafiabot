import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';
import { createVkJoinSession } from '../server/services/vkJoinAuthService.ts';

const openDatabases: DatabaseWrapper[] = [];

const createTestDatabase = () => {
  const db = createDatabaseConnection(':memory:');
  openDatabases.push(db);
  return db;
};

afterEach(() => {
  while (openDatabases.length) {
    const db = openDatabases.pop();
    try { db?.sqlite.close(); } catch { /* already closed */ }
  }
});

describe('organizer access linked to verified player identity', () => {
  it('binds after one password login and auto-authorizes the same Telegram player session', async () => {
    const db = createTestDatabase();
    const player = (await registerNewPlayer(db, {
      telegramUserId: '910000001',
      telegramUsername: 'organizer_test',
      fullName: 'Organizer Test',
      nickname: 'Organizer Test',
      source: 'test',
    })).player;
    const otherPlayer = (await registerNewPlayer(db, {
      telegramUserId: '910000002',
      telegramUsername: 'ordinary_test',
      fullName: 'Ordinary Test',
      nickname: 'Ordinary Test',
      source: 'test',
    })).player;
    const app = await createApp(db);

    const playerToken = generatePlayerSessionToken(player.id);
    const login = await request(app)
      .post('/api/auth/login')
      .set('Cookie', `player_token=${playerToken}`)
      .send({ password: 'adminpass' });

    expect(login.status).toBe(200);
    expect(login.body.organizerAccountLinked).toBe(true);
    expect(await db.get(
      'SELECT player_id FROM organizer_player_access WHERE player_id = ? LIMIT 1',
      [player.id],
    )).toMatchObject({ player_id: player.id });

    const autoMe = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `player_token=${playerToken}`);

    expect(autoMe.status).toBe(200);
    expect(autoMe.body.isOrganizer).toBe(true);
    expect(autoMe.body.organizerAutoAuthorized).toBe(true);
    expect(autoMe.body.player?.id).toBe(player.id);
    expect(autoMe.headers['set-cookie']?.join(';')).toContain('organizer_token=');

    const ordinaryMe = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `player_token=${generatePlayerSessionToken(otherPlayer.id)}`);

    expect(ordinaryMe.status).toBe(200);
    expect(ordinaryMe.body.isOrganizer).toBe(false);
    expect(ordinaryMe.body.organizerAutoAuthorized).toBe(false);
  });

  it('uses a verified linked VK session for the same persistent organizer entitlement', async () => {
    const db = createTestDatabase();
    const player = (await registerNewPlayer(db, {
      telegramUserId: '920000001',
      telegramUsername: 'vk_organizer_test',
      fullName: 'VK Organizer Test',
      nickname: 'VK Organizer Test',
      source: 'test',
    })).player;
    const app = await createApp(db);
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO player_external_identities (
        platform, external_user_id, player_id, screen_name, display_name, linked_at, updated_at
      ) VALUES ('vk', ?, ?, NULL, NULL, ?, ?)
    `, ['777001', player.id, now, now]);

    const vkSession = await createVkJoinSession(db, '777001');
    const vkCookie = `vk_join_session=${vkSession.sessionToken}`;

    const login = await request(app)
      .post('/api/auth/login')
      .set('Cookie', vkCookie)
      .send({ password: 'adminpass' });

    expect(login.status).toBe(200);
    expect(login.body.organizerAccountLinked).toBe(true);

    const autoMe = await request(app)
      .get('/api/auth/me')
      .set('Cookie', vkCookie);

    expect(autoMe.status).toBe(200);
    expect(autoMe.body.isOrganizer).toBe(true);
    expect(autoMe.body.organizerAutoAuthorized).toBe(true);
    expect(autoMe.body.player?.id).toBe(player.id);
    expect(autoMe.headers['set-cookie']?.join(';')).toContain('organizer_token=');
  });
});
