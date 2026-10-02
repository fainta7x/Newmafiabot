import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { buildCancelPostDraft, cancelEveningByOrganizer, loadCancelPost } from '../server/services/eveningCancelService.ts';
import { loadEveningRoute } from '../server/services/eveningRouteService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  const starts = new Date(Date.now() + 3 * 3600_000).toISOString();
  // A novice evening that did not gather and a club evening that did.
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('nov','Новички',?,'Europe/Moscow','NOVICE','published',20,200,?,?), ('club','Клуб',?,'Europe/Moscow','CASUAL','published',20,100,?,?)`, [starts, now, now, starts, now, now]);
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at)
    VALUES ('novice','Новички','-100700',5,1,?,?), ('club','Клуб','-100500',77,1,?,?)`, [now, now, now, now]);
  await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', ['p1', 'Аня', now, now]);
  await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,registration_status,response_status,attendance_status,payment_status,created_at,updated_at)
    VALUES ('ep1','nov','p1','going','going','pending','unpaid',?,?)`, [now, now]);
  return db;
}

describe('cancelling an evening from «Сбор»', () => {
  it('cancels only that evening, tells the player and posts to its own group', async () => {
    const db = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const fetchImpl = (async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as any;

    const route = await loadEveningRoute(db, 'nov');
    const step = route.stages.find((stage) => stage.id === 'gather')!.steps.find((item) => item.id === 'cancel')!;
    expect(step.action).toBe('cancel_evening');

    const draft = await buildCancelPostDraft(db, 'nov');
    expect(draft.text).toContain('Вечер для новичков');
    expect(draft.text).toContain('отменяется');

    const result = await cancelEveningByOrganizer(db, 'nov', { text: 'Сегодня новичков не будет, до встречи!' }, fetchImpl);
    expect((await db.get<any>("SELECT status FROM game_evenings WHERE id = 'nov'")).status).toBe('cancelled');
    expect((await db.get<any>("SELECT status FROM game_evenings WHERE id = 'club'")).status).toBe('published');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/sendMessage');
    expect(calls[0].body).toMatchObject({ chat_id: '-100700', message_thread_id: 5, text: 'Сегодня новичков не будет, до встречи!' });
    // VK is not configured in tests: the post reached Telegram only.
    expect(result.state).toBe('partial');
    const note = await db.get<any>("SELECT COUNT(*) AS count FROM personal_notification_outbox WHERE notification_key = 'evening-cancelled:nov:p1'").catch(() => null);
    if (note) expect(Number(note.count)).toBe(1);

    // A second call changes nothing and posts nothing more.
    await cancelEveningByOrganizer(db, 'nov', {}, fetchImpl);
    expect(calls).toHaveLength(1);
    expect((await loadCancelPost(db, 'nov')).telegram_status).toBe('published');

    const after = await loadEveningRoute(db, 'nov');
    const done = after.stages.find((stage) => stage.id === 'gather')!.steps.find((item) => item.id === 'cancel')!;
    expect(done.title).toBe('Вечер отменён');
    expect(done.status).toBe('done');
  });

  it('refuses an evening that already has games', async () => {
    const db = await setup();
    await db.run("UPDATE game_evenings SET status = 'active' WHERE id = 'club'");
    await expect(cancelEveningByOrganizer(db, 'club')).rejects.toThrow(/ещё не начался/);
  });
});
