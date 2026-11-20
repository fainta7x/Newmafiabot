import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { CURSE_WEEK_MS, curseUntil, cursePostText, eveningCurses, liftCurse, runCursePosts, setEveningCurse } from '../server/services/playerCurseService.ts';
import { recordInitialAnnouncementAttempt } from '../server/services/eveningAnnouncementTrackingService.ts';

// «Проклятье на понос» (owner, 2026-11-19): on Friday 10:00 the bot marks who ignored the invitation, a week per ignored
// evening, a personal message, the mark in the profile and lists, a separate «Новости» post; the organizer takes it back.
const t0 = new Date('2026-11-20T10:00:00Z');
const hours = (h: number) => new Date(t0.getTime() + h * 3_600_000);
describe('Проклятье на понос', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    for (const id of ['a', 'b', 'c', 'd']) await db.run("INSERT INTO players(id,nickname,tokens,telegram_user_id,created_at,updated_at) VALUES (?,?,0,?,'x','x')", [id, id.toUpperCase(), `tg-${id}`]);
    for (const [id, at] of [['e1', '2026-11-20T16:00:00Z'], ['e2', '2026-11-22T16:00:00Z']]) {
      await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES (?,?,?,'Europe/Moscow','CASUAL','published',20,0,'x','x')`, [id, `Вечер ${id}`, at]);
    }
  });
  afterEach(() => { vi.unstubAllEnvs(); db.sqlite.close(); });

  it('a week per ignored evening, one after another; a personal message; taking a mark back; lifting', async () => {
    await setEveningCurse(db, { evening_id: 'e1', player_id: 'a' }, 'org', t0);
    expect(await curseUntil(db, 'a', t0)).toBe(new Date(t0.getTime() + CURSE_WEEK_MS).toISOString());
    await setEveningCurse(db, { evening_id: 'e2', player_id: 'a' }, 'org', hours(1));
    expect(await curseUntil(db, 'a', hours(1))).toBe(new Date(t0.getTime() + 2 * CURSE_WEEK_MS).toISOString());
    // The same evening twice is still one week.
    await setEveningCurse(db, { evening_id: 'e2', player_id: 'a' }, 'org', hours(2));
    expect(await curseUntil(db, 'a', hours(2))).toBe(new Date(t0.getTime() + 2 * CURSE_WEEK_MS).toISOString());
    const messages = await db.all<{ player_id: string; text: string }>("SELECT player_id, text FROM personal_notification_deliveries WHERE event_type = 'player_curse'");
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toContain('Проклятье на понос');
    expect(messages[0].text).toContain('любой ответ');
    // Taken back: one week less.
    await setEveningCurse(db, { evening_id: 'e2', player_id: 'a', on: false }, 'org', hours(3));
    expect((await eveningCurses(db, 'e2', hours(3)))).toEqual([]);
    expect(await curseUntil(db, 'a', hours(3))).toBe(new Date(t0.getTime() + CURSE_WEEK_MS).toISOString());
    // Over after its week; lifted at once by the organizer.
    expect(await curseUntil(db, 'a', new Date(t0.getTime() + CURSE_WEEK_MS + 1))).toBeNull();
    await liftCurse(db, 'a', hours(4));
    expect(await curseUntil(db, 'a', hours(4))).toBeNull();
  });

  it('Friday 11:00 Moscow: everybody invited without an answer is marked once, one «Новости» post; later changes edit it', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    await ensureTelegramPublishingSchema(db);
    const calls: Array<{ method: string; body: any }> = [];
    const fetchImpl = (async (url: string, init: any) => { calls.push({ method: String(url).split('/').pop()!, body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify({ ok: true, result: { message_id: 5 } }), { status: 200 }); }) as unknown as typeof fetch;
    // a, d: invited, silent; b: invited, answered «Думаю»; c: the invitation never reached him.
    for (const id of ['a', 'b', 'd']) await recordInitialAnnouncementAttempt(db, { eveningId: 'e1', playerId: id, telegramUserId: `tg-${id}`, success: true, telegramMessageId: 1 });
    await recordInitialAnnouncementAttempt(db, { eveningId: 'e1', playerId: 'c', telegramUserId: 'tg-c', success: false, error: 'blocked' });
    await db.run("INSERT INTO evening_participants(id,evening_id,player_id,attendance_status,response_status,registration_status,created_at,updated_at) VALUES ('ep-b','e1','b','pending','thinking','thinking','x','x')");
    const at = (iso: string) => new Date(iso);
    expect(await runCursePosts(db, fetchImpl, at('2026-11-19T09:00:00Z'))).toBe(0); // Thursday
    expect(await runCursePosts(db, fetchImpl, at('2026-11-20T07:59:00Z'))).toBe(0); // Friday 10:59 Moscow
    expect(await curseUntil(db, 'a', at('2026-11-20T07:59:00Z'))).toBeNull();
    expect(await runCursePosts(db, fetchImpl, at('2026-11-20T08:00:00Z'))).toBe(1); // Friday 11:00 Moscow
    expect((await eveningCurses(db, 'e1', at('2026-11-20T08:00:00Z'))).map((row) => row.player_id).sort()).toEqual(['a', 'd']);
    const week = (iso: string) => new Date(at(iso).getTime() + CURSE_WEEK_MS).toISOString();
    expect(calls).toHaveLength(1);
    expect(calls[0].body.text).toBe(cursePostText('2026-11-20T12:00:00Z', [{ nickname: 'A', until: week('2026-11-20T08:00:00Z'), count: 1 }, { nickname: 'D', until: week('2026-11-20T08:00:00Z'), count: 1 }]));
    expect(calls[0].body.text).toContain('• A — до 27 ноября (1 проклятье)');
    expect(calls[0].body.text).toContain('Проклятье можно избежать, если ответить боту до начала вечера или его отмены.');
    const messages = await db.all<{ player_id: string; text: string }>("SELECT player_id, text FROM personal_notification_deliveries WHERE event_type = 'player_curse' ORDER BY player_id");
    expect(messages.map((row) => row.player_id)).toEqual(['a', 'd']);
    expect(messages[0].text).toContain('Проклятье можно избежать, если ответить боту до начала вечера или его отмены.');
    // a answers before the evening: his week goes and the sent post is edited.
    await db.run("INSERT INTO evening_participants(id,evening_id,player_id,attendance_status,response_status,registration_status,created_at,updated_at) VALUES ('ep-a','e1','a','pending','declined','declined','x','x')");
    expect(await runCursePosts(db, fetchImpl, at('2026-11-20T09:00:00Z'))).toBe(0);
    expect(await curseUntil(db, 'a', at('2026-11-20T09:00:00Z'))).toBeNull();
    expect(calls.at(-1)).toMatchObject({ method: 'editMessageText', body: { message_id: 5 } });
    expect(calls.at(-1)!.body.text).not.toContain('• A —');
    expect(calls.at(-1)!.body.text).toContain('• D —');
    // The same text is not edited again; once the evening started an answer no longer lifts it.
    expect(await runCursePosts(db, fetchImpl, at('2026-11-20T09:05:00Z'))).toBe(0);
    expect(calls).toHaveLength(2);
    await db.run("INSERT INTO evening_participants(id,evening_id,player_id,attendance_status,response_status,registration_status,created_at,updated_at) VALUES ('ep-d','e1','d','pending','going','going','x','x')");
    await runCursePosts(db, fetchImpl, at('2026-11-20T16:30:00Z'));
    expect(await curseUntil(db, 'd', at('2026-11-20T16:30:00Z'))).toBeTruthy();
    // The organizer takes the last mark back: the post says nobody.
    await setEveningCurse(db, { evening_id: 'e1', player_id: 'd', on: false }, 'org', at('2026-11-20T16:40:00Z'));
    await runCursePosts(db, fetchImpl, at('2026-11-20T16:41:00Z'));
    expect(calls.at(-1)!.body.text).toContain('все ответили — проклятий нет');
  });

  it('two Friday evenings: a week for each ignored invitation, one post with everybody once and the count; novice evenings are off', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    await ensureTelegramPublishingSchema(db);
    const sent: any[] = [];
    const fetchImpl = (async (_url: string, init: any) => { sent.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ ok: true, result: { message_id: 5 } }), { status: 200 }); }) as unknown as typeof fetch;
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('n1','Второй','2026-11-20T15:00:00Z','Europe/Moscow','CASUAL','published',20,0,'x','x')`);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('nov','Новички','2026-11-20T14:00:00Z','Europe/Moscow','NOVICE','published',20,0,'x','x')`);
    for (const evening of ['e1', 'n1', 'nov']) await recordInitialAnnouncementAttempt(db, { eveningId: evening, playerId: 'a', telegramUserId: 'tg-a', success: true, telegramMessageId: 1 });
    await recordInitialAnnouncementAttempt(db, { eveningId: 'e1', playerId: 'b', telegramUserId: 'tg-b', success: true, telegramMessageId: 1 });
    const at = new Date('2026-11-20T08:01:00Z');
    expect(await runCursePosts(db, fetchImpl, at)).toBe(1);
    expect(await curseUntil(db, 'a', at)).toBe(new Date(at.getTime() + 2 * CURSE_WEEK_MS).toISOString());
    expect(await eveningCurses(db, 'nov', at)).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(sent[0].text.match(/• A —/g)).toHaveLength(1);
    expect(sent[0].text).toContain('• A — до 4 декабря (2 проклятья)');
    expect(sent[0].text).toContain('• B —');
  });

  it('marks of a novice evening made before it was switched off are taken back', async () => {
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('nov','Новички','2026-11-20T14:00:00Z','Europe/Moscow','NOVICE','published',20,0,'x','x')`);
    await setEveningCurse(db, { evening_id: 'nov', player_id: 'a' }, 'bot', new Date('2026-11-20T07:00:00Z'));
    await setEveningCurse(db, { evening_id: 'e1', player_id: 'a' }, 'bot', new Date('2026-11-20T07:00:00Z'));
    expect(await curseUntil(db, 'a', new Date('2026-11-20T07:01:00Z'))).toBe(new Date(new Date('2026-11-20T07:00:00Z').getTime() + 2 * CURSE_WEEK_MS).toISOString());
    await runCursePosts(db, (async () => new Response('{}')) as unknown as typeof fetch, new Date('2026-11-20T07:05:00Z'));
    expect(await eveningCurses(db, 'nov', new Date('2026-11-20T07:05:00Z'))).toEqual([]);
    expect(await curseUntil(db, 'a', new Date('2026-11-20T07:05:00Z'))).toBe(new Date(new Date('2026-11-20T07:00:00Z').getTime() + CURSE_WEEK_MS).toISOString());
  });

  it('API: the organizer marks; players see the mark in the list and the profile', async () => {
    const app = await createApp(db);
    const org = `organizer_token=${generateOrganizerToken()}`;
    expect((await request(app).post('/api/crm/curses').send({ evening_id: 'e1', player_id: 'a' })).status).toBe(401);
    const marked = await request(app).post('/api/crm/curses').set('Cookie', org).send({ evening_id: 'e1', player_id: 'a' });
    expect(marked.body.items.map((item: any) => item.player_id)).toEqual(['a']);
    const viewer = `player_token=${generatePlayerSessionToken('b')}`;
    const list = await request(app).get('/api/player/players').set('Cookie', viewer);
    expect(list.body.players.find((p: any) => p.id === 'a').curse_until).toBeTruthy();
    expect(list.body.players.find((p: any) => p.id === 'b').curse_until).toBeNull();
    const profile = await request(app).get('/api/player/profiles/a/summary').set('Cookie', viewer);
    expect(profile.body.player.curse_until).toBeTruthy();
    expect((await request(app).post('/api/crm/curses/lift').set('Cookie', org).send({ player_id: 'a' })).body.until).toBeNull();
  });
});
