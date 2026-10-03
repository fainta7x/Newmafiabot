import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { decodeSeatingImage, sendSeatingImage } from '../server/services/tournamentSeatingShareService.ts';
import { createSeatingImageLink, readSeatingImageLink, SEATING_LINK_TTL_MS } from '../server/services/seatingImageLinkService.ts';

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

  it('posts to the rating group topic, or to the acting organizer\'s own Telegram', async () => {
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
    // Another organizer's chat is never a fallback, even when the club has configured recipients.
    vi.stubEnv('ORGANIZER_NOTIFICATION_IDS', '999');
    const stray: any[] = [];
    await expect(sendSeatingImage(db, { tournamentId: 't', target: 'me', image: PNG, fetchImpl: okFetch(stray) })).rejects.toThrow('Не найден ваш Telegram');
    expect(stray).toHaveLength(0);
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

describe('public link to the seating picture', () => {
  it('gives an organizer a link, serves the PNG without login (download or inline), and 404s for a wrong token', async () => {
    const { app } = await setup();
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const made = await request(app).post('/api/tournaments/t/seating-image/link').set('Cookie', cookie).send({ image: PNG.toString('base64'), file_name: 'Кубок: рассадка.png' });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const path = new URL(made.body.url).pathname;
    expect(path).toMatch(/^\/api\/public\/seating-image\/[0-9a-f]{36}\//);

    const download = await request(app).get(path).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    expect(Buffer.compare(download.body as Buffer, PNG)).toBe(0);
    expect((await request(app).get(`${path}?inline=1`)).headers['content-disposition']).toMatch(/^inline;/);

    expect((await request(app).get('/api/public/seating-image/wrongtoken/x.png')).status).toBe(404);
    expect((await request(app).post('/api/tournaments/t/seating-image/link').send({ image: PNG.toString('base64') })).status).toBeGreaterThanOrEqual(401);
    expect((await request(app).post('/api/tournaments/nope/seating-image/link').set('Cookie', cookie).send({ image: PNG.toString('base64') })).status).toBe(404);
    expect((await request(app).post('/api/tournaments/t/seating-image/link').set('Cookie', cookie).send({ image: 'AAAA' })).status).toBe(400);
  });

  it('expires after 24 hours and keeps only the latest links', () => {
    const t0 = 1_000_000;
    const token = createSeatingImageLink(PNG, 'a.png', t0);
    expect(readSeatingImageLink(token, t0 + SEATING_LINK_TTL_MS - 1)?.fileName).toBe('a.png');
    expect(readSeatingImageLink(token, t0 + SEATING_LINK_TTL_MS)).toBeNull();
    const first = createSeatingImageLink(PNG, 'first.png', t0);
    for (let i = 0; i < 40; i += 1) createSeatingImageLink(PNG, `n${i}.png`, t0);
    expect(readSeatingImageLink(first, t0)).toBeNull();
  });
});
