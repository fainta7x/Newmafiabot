import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { publishGatheredPost } from '../server/services/eveningGatheredPostService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });
const organizerCookie = () => `organizer_token=${generateOrganizerToken()}`;
const PHOTO = `data:image/jpeg;base64,${Buffer.from('fake-jpeg-bytes').toString('base64')}`;

async function setup(status = 'active') {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('g1','Пятница',?,'Europe/Moscow','CASUAL',?,20,100,?,?)`, [now, status, now, now]);
  await db.run("UPDATE telegram_destinations SET chat_id = '-1001', topic_id = 7 WHERE id = 'club'");
  return { db, app };
}

describe('«Мы собрались» post', () => {
  it('blocks the first game of a running evening until the post is published or skipped', async () => {
    const { app } = await setup();
    const blocked = await request(app).post('/api/games/evening/g1').set('Cookie', organizerCookie()).send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('gathered_post_required');

    const skipped = await request(app).post('/api/evenings/g1/gathered-post/skip').set('Cookie', organizerCookie()).send({ reason: 'нет сети' });
    expect(skipped.body.state).toBe('skipped');
    const after = await request(app).post('/api/games/evening/g1').set('Cookie', organizerCookie()).send({});
    expect(after.body.code).not.toBe('gathered_post_required');

    const route = await request(app).get('/api/evenings/g1/route').set('Cookie', organizerCookie());
    const live = route.body.stages.find((stage: any) => stage.id === 'live');
    expect(live.steps[0]).toMatchObject({ id: 'gathered', status: 'attention', action: 'gathered_post' });
  });

  it('sends the photo to the evening Telegram group and records a failed VK leg', async () => {
    const { db } = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tg-token');
    const calls: Array<{ url: string; body: FormData }> = [];
    const fetchImpl = (async (url: string, init: any) => {
      calls.push({ url, body: init.body });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const post = await publishGatheredPost(db, 'g1', { data_url: PHOTO, caption: '' }, fetchImpl);
    expect(post.state).toBe('published');
    expect((post as any).telegram_status).toBe('published');
    expect((post as any).vk_status).toBe('failed');
    const telegram = calls.find((call) => call.url.includes('/sendPhoto'));
    expect(telegram?.body.get('chat_id')).toBe('-1001');
    expect(telegram?.body.get('message_thread_id')).toBe('7');
    expect(String(telegram?.body.get('caption'))).toContain('Мы собрались! Пятница начинается.');
  });

  it('only runs after the evening has started and needs a photo', async () => {
    const { db } = await setup('published');
    await expect(publishGatheredPost(db, 'g1', { data_url: PHOTO })).rejects.toThrow('после начала вечера');
    await db.run("UPDATE game_evenings SET status = 'active' WHERE id = 'g1'");
    await expect(publishGatheredPost(db, 'g1', { data_url: 'not-an-image' })).rejects.toThrow('Нужна фотография');
  });
});
