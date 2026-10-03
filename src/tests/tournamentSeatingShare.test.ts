import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { decodeSeatingImage, sendSeatingImage } from '../server/services/tournamentSeatingShareService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES ('t','Кубок',?,'draft',?,?)`, [stamp, stamp, stamp]);
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at) VALUES ('rating','Рейтинг','-100600',9,1,?,?)`, [stamp, stamp]);
  await db.run(`INSERT INTO players (id,nickname,telegram_user_id,created_at,updated_at) VALUES ('org','Чагин','777',?,?)`, [stamp, stamp]);
  return { db, app };
}

const okFetch = (calls: any[]) => (async (url: string, init: any) => { calls.push({ url, form: init.body as FormData }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as any;

describe('seating picture sent by the bot', () => {
  it('accepts only a PNG of a sane size', () => {
    expect(decodeSeatingImage(PNG.toString('base64'))).toHaveLength(PNG.length);
    expect(decodeSeatingImage(`data:image/png;base64,${PNG.toString('base64')}`)).toHaveLength(PNG.length);
    expect(() => decodeSeatingImage('')).toThrow('Нет картинки');
    expect(() => decodeSeatingImage(Buffer.from('not a picture at all').toString('base64'))).toThrow('PNG');
    expect(() => decodeSeatingImage(Buffer.concat([PNG, Buffer.alloc(1_500_000)]).toString('base64'))).toThrow('слишком большая');
  });

  it('posts to the rating group topic, or to the organizer\'s own Telegram', async () => {
    const { db } = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    await sendSeatingImage(db, { tournamentId: 't', target: 'group', image: PNG, fetchImpl: okFetch(calls) });
    expect(calls[0].url).toContain('/sendPhoto');
    expect(calls[0].form.get('chat_id')).toBe('-100600');
    expect(calls[0].form.get('message_thread_id')).toBe('9');
    expect(String(calls[0].form.get('caption'))).toContain('Рассадка турнира «Кубок»');

    await sendSeatingImage(db, { tournamentId: 't', target: 'me', image: PNG, actorPlayerId: 'org', fetchImpl: okFetch(calls) });
    expect(calls[1].form.get('chat_id')).toBe('777');
    expect(calls[1].form.get('message_thread_id')).toBeNull();
  });

  it('explains what is missing: no group, no Telegram, no bot, unknown tournament', async () => {
    const { db } = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    await expect(sendSeatingImage(db, { tournamentId: 'nope', target: 'group', image: PNG, fetchImpl: okFetch([]) })).rejects.toThrow('Турнир не найден');
    await expect(sendSeatingImage(db, { tournamentId: 't', target: 'me', image: PNG, fetchImpl: okFetch([]) })).rejects.toThrow('Не найден ваш Telegram');
    await db.run("UPDATE telegram_destinations SET active = 0 WHERE id = 'rating'");
    await expect(sendSeatingImage(db, { tournamentId: 't', target: 'group', image: PNG, fetchImpl: okFetch([]) })).rejects.toThrow('«Рейтинг»');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    await expect(sendSeatingImage(db, { tournamentId: 't', target: 'me', image: PNG, actorPlayerId: 'org', fetchImpl: okFetch([]) })).rejects.toThrow('бот не настроен');
  });

  it('is organizer-only and validates the request', async () => {
    const { app } = await setup();
    expect((await request(app).post('/api/tournaments/t/seating-image').send({ target: 'me', image: PNG.toString('base64') })).status).toBeGreaterThanOrEqual(401);
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const bad = await request(app).post('/api/tournaments/t/seating-image').set('Cookie', cookie).send({ target: 'x', image: PNG.toString('base64') });
    expect(bad.status).toBe(400);
    const noImage = await request(app).post('/api/tournaments/t/seating-image').set('Cookie', cookie).send({ target: 'me' });
    expect(noImage.status).toBe(400);
  });
});
