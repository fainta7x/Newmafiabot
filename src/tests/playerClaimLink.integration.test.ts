import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { beginVerifiedPlayerOnboarding, completeClaimPlayerOnboarding, requestExistingPlayerOnboardingLink } from '../server/services/playerOnboardingService.ts';
import { parseVkProfileInput } from '../server/services/vkProfileLinkService.ts';

const opened: DatabaseWrapper[] = [];
beforeEach(() => { process.env.BOT_API_SECRET = 'bot-secret-test'; process.env.TELEGRAM_BOT_USERNAME = 'club_test_bot'; });
afterEach(() => {
  while (opened.length) opened.pop()?.sqlite.close();
  delete process.env.BOT_API_SECRET; delete process.env.TELEGRAM_BOT_USERNAME;
});

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  const player = (id: string, nickname: string, telegram: string | null = null) => db.run(
    'INSERT INTO players (id,nickname,telegram_user_id,created_at,updated_at) VALUES (?,?,?,?,?)', [id, nickname, telegram, stamp, stamp]);
  const organizer = `organizer_token=${generateOrganizerToken()}`;
  const makeLink = async (playerId: string) => {
    const response = await request(app).post(`/api/players/${playerId}/claim-link`).set('Cookie', organizer).send({});
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as { code: string; telegram_url: string; web_url: string };
  };
  const bot = (path: string, body: object) => request(app).post(`/api/bot/players/${path}`).set('X-Bot-Token', 'bot-secret-test').send(body);
  return { db, app, player, organizer, makeLink, bot };
}

describe('«Ссылка для привязки»', () => {
  it('links the Telegram that opens the link once, and only once', async () => {
    const { db, app, player, makeLink, bot } = await setup();
    await player('made', 'Вася');
    const link = await makeLink('made');
    expect(link.telegram_url).toBe(`https://t.me/club_test_bot?start=claim_${link.code}`);
    expect(link.web_url).toContain(`/player?claim=${link.code}`);
    expect((await request(app).get(`/api/auth/claim/${link.code}`)).body).toEqual({ nickname: 'Вася' });

    const claimed = await bot('claim', { telegram_user_id: 555, code: link.code });
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200);
    expect(claimed.body.player).toMatchObject({ id: 'made', nickname: 'Вася' });
    expect((await db.get<any>('SELECT telegram_user_id FROM players WHERE id = ?', ['made'])).telegram_user_id).toBe('555');

    const again = await bot('claim', { telegram_user_id: 777, code: link.code });
    expect(again.status).toBe(410);
    expect((await request(app).get(`/api/auth/claim/${link.code}`)).status).toBe(410);
  });

  it('refuses a Telegram that already belongs to another profile, and a new link replaces the old one', async () => {
    const { player, makeLink, bot } = await setup();
    await player('made', 'Вася');
    await player('self', 'Vasya', '555');
    const first = await makeLink('made');
    const second = await makeLink('made');
    expect((await bot('claim', { telegram_user_id: 900, code: first.code })).status).toBe(404);
    const conflict = await bot('claim', { telegram_user_id: 555, code: second.code });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toContain('другим игровым профилем');
  });

  it('links a VK sign-in through the onboarding step', async () => {
    const { db, player, makeLink } = await setup();
    await player('made', 'Вася');
    const link = await makeLink('made');
    const onboarding = await beginVerifiedPlayerOnboarding(db, { platform: 'vk', externalUserId: '4242' }, `/player?claim=${link.code}`);
    expect(onboarding.status).toBe('onboarding');
    const result = await completeClaimPlayerOnboarding(db, (onboarding as any).token, link.code);
    expect(result).toMatchObject({ playerId: 'made', nickname: 'Вася' });
    const vk = await db.get<any>("SELECT player_id FROM player_external_identities WHERE platform = 'vk' AND external_user_id = '4242'");
    expect(vk.player_id).toBe('made');
  });
});

describe('the bot when a nickname is taken', () => {
  it('«Это мой профиль» sends the organizer a link request', async () => {
    const { app, player, organizer, bot } = await setup();
    await player('made', 'Вася');
    const response = await bot('link-request', { telegram_user_id: 555, nickname: 'вася' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ status: 'pending_organizer', nickname: 'Вася' });
    const repeat = await bot('link-request', { telegram_user_id: 555, nickname: 'Вася' });
    expect(repeat.body.requestId).toBe(response.body.requestId);
    // Asking for another profile moves the same request to it.
    await player('other', 'Петя');
    const moved = await bot('link-request', { telegram_user_id: 555, nickname: 'Петя' });
    expect(moved.body).toMatchObject({ requestId: response.body.requestId, nickname: 'Петя' });
    const overview = await request(app).get('/api/crm/overview').set('Cookie', organizer);
    const pending = overview.body?.actionLists?.pendingOnboardingLinks || [];
    expect(pending.map((item: any) => item.target_player_id)).toEqual(['other']);
  });
});

describe('a profile that already belongs to another player', () => {
  it('the bot request is refused with a code the bot turns into «pick another nickname»', async () => {
    const { player, bot } = await setup();
    await player('taken', 'Вася', '111');
    const response = await bot('link-request', { telegram_user_id: 555, nickname: 'Вася' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('nickname_linked_elsewhere');
  });

  it('registration tells the bot whether a taken nickname may still be claimed', async () => {
    const { player, bot } = await setup();
    await player('taken', 'Чагин', '111');
    await player('made', 'Вася');
    const linked = await bot('register', { telegram_user_id: 555, nickname: 'Чагин' });
    expect(linked.status).toBe(409);
    expect(linked.body).toMatchObject({ code: 'nickname_taken', claimable: false });
    const made = await bot('register', { telegram_user_id: 555, nickname: 'Вася' });
    expect(made.body).toMatchObject({ code: 'nickname_taken', claimable: true });
  });
});

describe('organizer manual verified-account linking in the player card', () => {
  it('shows a safe pending VK request on its target player card and resolves only after an organizer action', async () => {
    const { db, app, player, organizer } = await setup();
    await player('made', 'Старый профиль');
    const verified = await beginVerifiedPlayerOnboarding(db, { platform: 'vk', externalUserId: '9087123' }, '/player');
    if (verified.status !== 'onboarding') throw new Error('onboarding expected');
    const requested = await requestExistingPlayerOnboardingLink(db, verified.token, 'Старый профиль');
    expect(requested.status).toBe('pending_organizer');
    if (requested.status !== 'pending_organizer') throw new Error('pending request expected');

    const view = await request(app).get('/api/players/made/account-links').set('Cookie', organizer);
    expect(view.status, JSON.stringify(view.body)).toBe(200);
    expect(view.body.pending_links).toEqual([expect.objectContaining({ id: requested.requestId, platform: 'vk' })]);
    expect(JSON.stringify(view.body)).not.toContain('9087123');
    expect((await db.get<any>("SELECT player_id FROM player_external_identities WHERE external_user_id='9087123'"))).toBeNull();

    const approved = await request(app).post(`/api/crm/onboarding-links/${requested.requestId}/resolve`)
      .set('Cookie', organizer).send({ decision: 'approve' });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.status).toBe('approved');
    expect((await db.get<any>("SELECT player_id FROM player_external_identities WHERE platform='vk' AND external_user_id='9087123'"))?.player_id).toBe('made');
    expect((await request(app).get('/api/players/made/account-links').set('Cookie', organizer)).body.pending_links).toEqual([]);
  });
});

describe('VK page links', () => {
  it('understands the usual ways to write a VK page', () => {
    expect(parseVkProfileInput('https://vk.com/id123')).toBe('123');
    expect(parseVkProfileInput('vk.ru/durov?w=wall1')).toBe('durov');
    expect(parseVkProfileInput('@durov')).toBe('durov');
    expect(parseVkProfileInput('https://m.vk.com/some.name/')).toBe('some.name');
    expect(parseVkProfileInput('')).toBeNull();
    expect(parseVkProfileInput('not a link!')).toBeNull();
  });
});
