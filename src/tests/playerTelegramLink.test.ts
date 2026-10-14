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

describe('«Подтвердить через ВК» from the bot', () => {
  it('a Telegram account asks for a link, the signed-in VK player redeems it, and the Telegram is attached', async () => {
    const { db, app } = await setup();
    process.env.BOT_API_SECRET = 'bot-secret-test';
    const asked = await request(app).post('/api/bot/telegram-link-request').set('X-Bot-Token', 'bot-secret-test').send({ telegram_user_id: 555000 });
    expect(asked.status).toBe(200);
    expect(asked.body.url).toMatch(/\/player\?tglink=[A-Za-z0-9_-]{16,}$/);
    const code = decodeURIComponent(String(asked.body.url).split('tglink=')[1]);
    const cookie = `player_token=${generatePlayerSessionToken('vkplayer-0001')}`;
    expect((await request(app).post('/api/player/telegram-link/redeem').send({ code })).status).toBe(401);
    const redeemed = await request(app).post('/api/player/telegram-link/redeem').set('Cookie', cookie).send({ code });
    expect(redeemed.status).toBe(200);
    expect(redeemed.body.nickname).toBe('Атеист с ножом');
    expect((await db.get<any>('SELECT telegram_user_id FROM players WHERE id = ?', ['vkplayer-0001'])).telegram_user_id).toBe('555000');
    // The link is single-use.
    const again = await request(app).post('/api/player/telegram-link/redeem').set('Cookie', cookie).send({ code });
    expect(again.status).toBe(409);
    delete process.env.BOT_API_SECRET;
  });

  it('refuses a link that is not the player\'s to take: unknown, expired, or for a Telegram that belongs to someone else', async () => {
    const { db } = await setup();
    const { createTelegramLinkRequest, redeemTelegramLinkRequest } = await import('../server/services/telegramLinkRequestService.ts');
    await expect(redeemTelegramLinkRequest(db, { code: 'x'.repeat(24), playerId: 'vkplayer-0001' })).rejects.toMatchObject({ code: 'link_invalid' });
    const old = await createTelegramLinkRequest(db, { telegramUserId: 555001, baseUrl: 'https://app.example', now: new Date(Date.now() - 3 * 3600_000) });
    await expect(redeemTelegramLinkRequest(db, { code: old.code, playerId: 'vkplayer-0001' })).rejects.toMatchObject({ code: 'link_expired' });
    // Telegram 77 already belongs to «Чагин»: it cannot be taken by another profile.
    const taken = await createTelegramLinkRequest(db, { telegramUserId: 77, baseUrl: 'https://app.example' });
    await expect(redeemTelegramLinkRequest(db, { code: taken.code, playerId: 'vkplayer-0001' })).rejects.toMatchObject({ code: 'telegram_identity_conflict' });
  });

  it('lets a Telegram user ask the organizer to link a VK-only profile, but not one that has its own Telegram', async () => {
    const { db } = await setup();
    const { requestTelegramProfileLinkByNickname } = await import('../server/services/playerOnboardingService.ts');
    const ok = await requestTelegramProfileLinkByNickname(db, { telegramUserId: 555002, nickname: 'Атеист с ножом' });
    expect(ok.status).toBe('pending_organizer');
    await expect(requestTelegramProfileLinkByNickname(db, { telegramUserId: 555003, nickname: 'Чагин' })).rejects.toMatchObject({ code: 'nickname_linked_elsewhere' });
  });
});

describe('base URL cleanup', () => {
  it('cuts trailing slashes without a regular expression, also on a very long run of them', async () => {
    const { stripTrailingSlashes } = await import('../server/services/telegramLinkRequestService.ts');
    expect(stripTrailingSlashes('https://app.example///')).toBe('https://app.example');
    expect(stripTrailingSlashes('https://app.example')).toBe('https://app.example');
    expect(stripTrailingSlashes('/'.repeat(100000))).toBe('');
  });
});
