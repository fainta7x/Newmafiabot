import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { isNicknameVkOnlyProfile } from '../server/services/playerOnboardingService.ts';
import { redeemPlayerClaimLink } from '../server/services/playerClaimLinkService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); delete process.env.TELEGRAM_BOT_USERNAME; });

async function setup() {
  process.env.TELEGRAM_BOT_USERNAME = 'noire_test_bot';
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', ['vkplayer-0001', 'Атеист с ножом', now, now]);
  await db.run("INSERT INTO player_external_identities (platform, external_user_id, player_id, linked_at, updated_at) VALUES ('vk','900','vkplayer-0001',?,?)", [now, now]);
  await db.run('INSERT INTO players (id,nickname,telegram_user_id,created_at,updated_at) VALUES (?,?,?,?,?)', ['tgplayer-0002', 'Чагин', '77', now, now]);
  return { db, app };
}

describe('a VK player connects Telegram from the app', () => {
  it('gives a one-time bot link to a signed-in player without Telegram, and that link attaches the Telegram account', async () => {
    const { db, app } = await setup();
    expect((await request(app).post('/api/player/telegram-link')).status).toBe(401);
    const response = await request(app).post('/api/player/telegram-link').set('Cookie', `player_token=${generatePlayerSessionToken('vkplayer-0001')}`);
    expect(response.status).toBe(200);
    expect(response.body.telegram_url).toMatch(/^https:\/\/t\.me\/noire_test_bot\?start=claim_[A-Za-z0-9_-]{16,}$/);
    const code = String(response.body.telegram_url).split('claim_')[1];
    const result = await redeemPlayerClaimLink(db, { code, platform: 'telegram', externalUserId: '555000' });
    expect(result.playerId).toBe('vkplayer-0001');
    expect((await db.get<any>('SELECT telegram_user_id FROM players WHERE id = ?', ['vkplayer-0001'])).telegram_user_id).toBe('555000');
    // Once linked there is nothing more to connect.
    const again = await request(app).post('/api/player/telegram-link').set('Cookie', `player_token=${generatePlayerSessionToken('vkplayer-0001')}`);
    expect(again.status).toBe(409);
  });

  it('tells a VK-only profile from one that already has Telegram', async () => {
    const { db } = await setup();
    expect(await isNicknameVkOnlyProfile(db, 'Атеист с ножом')).toBe(true);
    expect(await isNicknameVkOnlyProfile(db, 'Чагин')).toBe(false);
    expect(await isNicknameVkOnlyProfile(db, 'Неизвестный')).toBe(false);
  });
});
