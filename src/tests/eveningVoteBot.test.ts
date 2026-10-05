import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { queueEveningVoteMessages, voteCallbackData } from '../server/services/eveningVoteMessageService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); delete process.env.BOT_API_SECRET; vi.unstubAllGlobals(); });

const EVENING = '11111111-2222-3333-4444-555555555555';

async function setup(settledHoursAgo = 2) {
  process.env.BOT_API_SECRET = 'bot-secret-test';
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  const settled = new Date(Date.now() - settledHoursAgo * 3600_000).toISOString();
  // a, b, c attended; d only registered; e is a VK-only attendee
  for (const [id, nick, telegram] of [['aaaa1111-0000', 'Альфа', 501], ['bbbb2222-0000', 'Бета', 502], ['cccc3333-0000', 'Гамма', 503], ['dddd4444-0000', 'Дельта', 504], ['eeee5555-0000', 'Эпсилон', null]] as const) {
    await db.run('INSERT INTO players (id,nickname,telegram_user_id,created_at,updated_at) VALUES (?,?,?,?,?)', [id, nick, telegram === null ? null : String(telegram), now, now]);
  }
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,settled_at,capacity,default_price,created_at,updated_at) VALUES (?, 'Пятница', ?, 'Europe/Moscow','RATING','completed',?,20,100,?,?)`, [EVENING, settled, settled, now, now]);
  for (const [index, id] of ['aaaa1111-0000', 'bbbb2222-0000', 'cccc3333-0000', 'eeee5555-0000'].entries()) {
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,attendance_status,response_status,created_at,updated_at) VALUES (?,?,?,'attended','going',?,?)`, [`ep${index}`, EVENING, id, now, now]);
  }
  await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,attendance_status,response_status,created_at,updated_at) VALUES ('epd',?,?,'registered','going',?,?)`, [EVENING, 'dddd4444-0000', now, now]);
  await db.run("INSERT INTO player_external_identities (platform, external_user_id, player_id, linked_at, updated_at) VALUES ('vk','900','eeee5555-0000',?,?)", [now, now]);
  return { db, app };
}
const vote = (app: any, telegramUserId: number, nominee: string) =>
  request(app).post(`/api/bot/evenings/${EVENING}/vote`).set('X-Bot-Token', 'bot-secret-test').send({ telegram_user_id: telegramUserId, nominee });
const mine = async (db: DatabaseWrapper, voter: string) => (await db.get<any>("SELECT nominee_player_id FROM evening_player_votes WHERE evening_id = ? AND voter_player_id = ?", [EVENING, voter]))?.nominee_player_id;

describe('«Игрок вечера» from the bot buttons', () => {
  it('records the vote from the start of the player id, and a second tap changes it', async () => {
    const { app, db } = await setup();
    const first = await vote(app, 501, 'bbbb2222');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ success: true, nominee: 'Бета' });
    expect(await mine(db, 'aaaa1111-0000')).toBe('bbbb2222-0000');
    expect((await vote(app, 501, 'cccc3333')).status).toBe(200);
    expect(await mine(db, 'aaaa1111-0000')).toBe('cccc3333-0000');
    expect(Number((await db.get<any>('SELECT COUNT(*) AS c FROM evening_player_votes'))?.c)).toBe(1);
  });

  it('refuses a vote for yourself, for somebody who did not attend, and for an unknown player', async () => {
    const { app } = await setup();
    expect((await vote(app, 501, 'aaaa1111')).body.code).toBe('bad_nominee');
    expect((await vote(app, 501, 'dddd4444')).body.code).toBe('bad_nominee');
    expect((await vote(app, 501, 'zzzz')).status).toBe(400);
    expect((await vote(app, 501, 'bb')).body.code).toBe('bad_nominee');
  });

  it('refuses a voter who was not at the evening, and an unknown Telegram user', async () => {
    const { app } = await setup();
    expect((await vote(app, 504, 'aaaa1111')).status).toBe(403);
    expect((await vote(app, 999, 'aaaa1111')).status).toBe(404);
  });

  it('is closed three days after the evening', async () => {
    const { app } = await setup(24 * 4);
    const closed = await vote(app, 501, 'bbbb2222');
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe('closed');
  });

  it('needs the bot secret', async () => {
    const { app } = await setup();
    expect((await request(app).post(`/api/bot/evenings/${EVENING}/vote`).send({ telegram_user_id: 501, nominee: 'bbbb2222' })).status).toBeGreaterThanOrEqual(401);
  });

  it('shares its votes with the app voting screen', async () => {
    const { app } = await setup();
    await vote(app, 501, 'bbbb2222');
    const screen = await request(app).get(`/api/player/stories/${EVENING}/voting`).set('Cookie', `player_token=${generatePlayerSessionToken('aaaa1111-0000')}`);
    expect(screen.status).toBe(200);
    expect(screen.body.my_votes).toMatchObject({ best_player: 'bbbb2222-0000' });
  });
});

describe('the voting message with buttons', () => {
  it('goes to every attendee reached through Telegram, with a button for each other attendee', async () => {
    const { db } = await setup();
    expect(await queueEveningVoteMessages(db, EVENING, 'Пятница')).toBe(3);
    const rows = await db.all<any>("SELECT player_id, reply_markup_json, text FROM telegram_message_outbox WHERE message_key LIKE 'evening-vote:%' ORDER BY player_id");
    expect(rows.map((row) => row.player_id)).toEqual(['aaaa1111-0000', 'bbbb2222-0000', 'cccc3333-0000']);
    const keyboard = JSON.parse(rows[0].reply_markup_json).inline_keyboard.flat();
    // Alpha sees Beta, Gamma and the VK attendee Epsilon, but not himself and not the one who did not attend
    expect(keyboard.map((button: any) => button.text)).toEqual(['Бета', 'Гамма', 'Эпсилон']);
    expect(keyboard.every((button: any) => Buffer.byteLength(button.callback_data) <= 64)).toBe(true);
    expect(keyboard[0].callback_data).toBe(`evv:${EVENING}:bbbb2222-0000`);
    expect(rows[0].text).toContain('кто сыграл лучше всех');
  });

  it('is queued once, and a player reached only through VK is left to the app', async () => {
    const { db } = await setup();
    await queueEveningVoteMessages(db, EVENING, 'Пятница');
    expect(await queueEveningVoteMessages(db, EVENING, 'Пятница')).toBe(0);
    expect(await db.get<any>("SELECT 1 FROM personal_notification_deliveries WHERE notification_key = ?", [`evening-vote:${EVENING}:eeee5555-0000`])).toBeNull();
  });

  it('keeps the callback data inside Telegram\'s 64 bytes even for a long evening id', () => {
    const data = voteCallbackData('x'.repeat(40), 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(Buffer.byteLength(data!)).toBeLessThanOrEqual(64);
    expect(voteCallbackData('x'.repeat(60), 'aaaaaaaa')).toBeNull();
  });
});
