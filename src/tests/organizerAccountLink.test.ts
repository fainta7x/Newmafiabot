import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../db/ensureOrganizerPlayerAccessSchema.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';
import { createVkJoinSession } from '../server/services/vkJoinAuthService.ts';

const openDatabases: DatabaseWrapper[] = [];

const createTestDatabase = () => {
  const db = createDatabaseConnection(':memory:');
  openDatabases.push(db);
  return db;
};

const responseCookies = (value: string | string[] | undefined) => (
  Array.isArray(value) ? value : value ? [value] : []
);

const createCanonicalOwner = async (db: DatabaseWrapper, telegramUserId: string) => {
  const created = (await registerNewPlayer(db, {
    telegramUserId,
    telegramUsername: 'canonical_owner_test',
    fullName: 'Canonical Owner Test',
    nickname: 'Canonical Owner Test',
    source: 'test',
  })).player;
  await db.run('UPDATE players SET id = ? WHERE id = ?', [PRIMARY_ORGANIZER_PLAYER_ID, created.id]);
  return { ...created, id: PRIMARY_ORGANIZER_PLAYER_ID };
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
    expect(responseCookies(autoMe.headers['set-cookie']).join(';')).toContain('organizer_token=');

    const ordinaryMe = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `player_token=${generatePlayerSessionToken(otherPlayer.id)}`);

    expect(ordinaryMe.status).toBe(200);
    expect(ordinaryMe.body.isOrganizer).toBe(false);
    expect(ordinaryMe.body.organizerAutoAuthorized).toBe(false);
  });

  it('auto-authorizes the canonical CRM owner through Telegram without any password login', async () => {
    const db = createTestDatabase();
    const owner = await createCanonicalOwner(db, '930000001');
    const otherPlayer = (await registerNewPlayer(db, {
      telegramUserId: '930000002',
      telegramUsername: 'other_admin_test',
      fullName: 'Other Admin Test',
      nickname: 'Other Admin Test',
      source: 'test',
    })).player;
    const app = await createApp(db);

    const ownerMe = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `player_token=${generatePlayerSessionToken(owner.id)}`);

    expect(ownerMe.status).toBe(200);
    expect(ownerMe.body.isOrganizer).toBe(true);
    expect(ownerMe.body.organizerAutoAuthorized).toBe(true);
    expect(ownerMe.body.player?.id).toBe(PRIMARY_ORGANIZER_PLAYER_ID);
    expect(responseCookies(ownerMe.headers['set-cookie']).join(';')).toContain('organizer_token=');
    expect(await db.get(
      'SELECT player_id, granted_via FROM organizer_player_access WHERE player_id = ? LIMIT 1',
      [PRIMARY_ORGANIZER_PLAYER_ID],
    )).toMatchObject({ player_id: PRIMARY_ORGANIZER_PLAYER_ID, granted_via: 'canonical_owner' });

    const otherMe = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `player_token=${generatePlayerSessionToken(otherPlayer.id)}`);

    expect(otherMe.status).toBe(200);
    expect(otherMe.body.isOrganizer).toBe(false);
  });

  it('auto-authorizes the same canonical CRM owner through a linked VK session without a password', async () => {
    const db = createTestDatabase();
    const owner = await createCanonicalOwner(db, '940000001');
    const app = await createApp(db);
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO player_external_identities (
        platform, external_user_id, player_id, screen_name, display_name, linked_at, updated_at
      ) VALUES ('vk', ?, ?, NULL, NULL, ?, ?)
    `, ['777001', owner.id, now, now]);

    const vkSession = await createVkJoinSession(db, '777001');
    const autoMe = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `vk_join_session=${vkSession.sessionToken}`);

    expect(autoMe.status).toBe(200);
    expect(autoMe.body.isOrganizer).toBe(true);
    expect(autoMe.body.organizerAutoAuthorized).toBe(true);
    expect(autoMe.body.player?.id).toBe(PRIMARY_ORGANIZER_PLAYER_ID);
    expect(responseCookies(autoMe.headers['set-cookie']).join(';')).toContain('organizer_token=');
  });
});
