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
  it('does not hold the first game of a running evening; the post is a task of the route that becomes due once games are played', async () => {
    const { app, db } = await setup();
    const route = async () => (await request(app).get('/api/evenings/g1/route').set('Cookie', organizerCookie())).body.stages.find((stage: any) => stage.id === 'live').steps[0];
    // Before the first game: only an informational step that says when to take the photo.
    expect(await route()).toMatchObject({ id: 'gathered', status: 'info', action: 'gathered_post' });
    expect((await route()).detail).toContain('2–3-й игрой');

    // The game creation reaches the judge check (it used to stop earlier with 409 «gathered_post_required»).
    const first = await request(app).post('/api/games/evening/g1').set('Cookie', organizerCookie()).send({});
    expect(first.status).toBe(400);
    expect(first.body.code).toBe('judge_required');
    // From the first game on, the photo is a task that is due.
    await db.run("INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES ('g1',1,'2026-10-12','draft','Черновик','','[]',?)", [new Date().toISOString()]);
    expect(await route()).toMatchObject({ id: 'gathered', status: 'attention', action: 'gathered_post' });

    const skipped = await request(app).post('/api/evenings/g1/gathered-post/skip').set('Cookie', organizerCookie()).send({ reason: 'нет сети' });
    expect(skipped.body.state).toBe('skipped');
    expect(await route()).toMatchObject({ id: 'gathered', status: 'attention', action: 'gathered_post' });
    expect(Number((await db.get<any>('SELECT COUNT(*) AS count FROM games WHERE evening_id = ?', ['g1'])).count)).toBeGreaterThan(0);
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
    expect(post.state).toBe('partial');
    expect((post as any).telegram_status).toBe('published');
    expect((post as any).vk_status).toBe('failed');
    const telegram = calls.find((call) => call.url.includes('/sendPhoto'));
    expect(telegram?.body.get('chat_id')).toBe('-1001');
    expect(telegram?.body.get('message_thread_id')).toBe('7');
    expect(String(telegram?.body.get('caption'))).toContain('Мы собрались! Пятница начинается.');

    // A retry without a new photo never posts to Telegram again; only the failed VK leg is attempted.
    const sendsBefore = calls.filter((call) => call.url.includes('/sendPhoto')).length;
    const retried = await publishGatheredPost(db, 'g1', {}, fetchImpl);
    expect(retried.state).toBe('partial');
    expect(calls.filter((call) => call.url.includes('/sendPhoto')).length).toBe(sendsBefore);
  });

  it('refuses a second publication while one is still being sent', async () => {
    const { db } = await setup();
    await publishGatheredPost(db, 'g1', { data_url: PHOTO }, (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch);
    await db.run('UPDATE evening_gathered_posts SET sending_until = ? WHERE evening_id = ?', [new Date(Date.now() + 60_000).toISOString(), 'g1']);
    await expect(publishGatheredPost(db, 'g1', { data_url: PHOTO })).rejects.toThrow('уже отправляется');
  });

  it('only runs after the evening has started and needs a photo', async () => {
    const { db } = await setup('published');
    await expect(publishGatheredPost(db, 'g1', { data_url: PHOTO })).rejects.toThrow('после начала вечера');
    await db.run("UPDATE game_evenings SET status = 'active' WHERE id = 'g1'");
    await expect(publishGatheredPost(db, 'g1', { data_url: 'not-an-image' })).rejects.toThrow('Нужна фотография');
  });
});
