import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { buildTodayPostDraft, loadTodayPost, publishTodayPost, runTodayPostSchedule, skipTodayPost } from '../server/services/eveningTodayPostService.ts';
import { loadEveningRoute } from '../server/services/eveningRouteService.ts';
import { loadEveningSlotPlan } from '../server/services/eveningSlotPlanningService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,venue,created_at,updated_at)
    VALUES ('ev','Пятница','2026-10-02T18:00:00.000Z','Europe/Moscow','CASUAL','published',20,100,'Суп с Котом',?,?)`, [now, now]);
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at)
    VALUES ('club','Клуб','-100500',77,1,?,?)`, [now, now]);
  const people = [['a', 'Аня', 'going'], ['b', 'Борис', 'late'], ['c', 'Вера', 'going'], ['d', 'Гоша', 'declined']];
  for (const [id, nickname, answer] of people) {
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [id, nickname, now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,registration_status,response_status,attendance_status,payment_status,created_at,updated_at)
      VALUES (?,?,?,?,?,'pending','unpaid',?,?)`, [`ep-${id}`, 'ev', id, answer, answer, now, now]);
  }
  // Вера plays from the third game only.
  const plan = await loadEveningSlotPlan(db, 'ev');
  await db.run("DELETE FROM evening_slot_registrations WHERE participant_id = 'ep-c'");
  for (const slot of plan.slots.filter((item: any) => item.slot_number >= 3)) {
    await db.run('INSERT INTO evening_slot_registrations (id, slot_id, participant_id, created_at, updated_at) VALUES (?,?,?,?,?)', [`r-${slot.id}`, slot.id, 'ep-c', now, now]);
  }
  return db;
}

describe('«Сегодня играем» post', () => {
  it('builds a bright text with the chosen game, the roster and a call to join', async () => {
    const db = await setup();
    const draft = await buildTodayPostDraft(db, 'ev', 2);
    expect(draft.game_number).toBe(2);
    expect(draft.text).toContain('Всем привет! Сегодня играем');
    expect(draft.text).toContain('Ждём всех к 2-й игре — в 22:00');
    expect(draft.text).toContain('📍 Суп с Котом');
    expect(draft.text).toContain('Состав (3)');
    expect(draft.text).toContain('Аня');
    expect(draft.text).toContain('Борис (подойдёт позже)');
    expect(draft.text).toContain('Вера (с 3-й игры)');
    expect(draft.text).not.toContain('Гоша');
    expect(draft.text).toMatch(/не хватает \d+ человек/);
  });

  it('publishes to the evening group once and shows in the route', async () => {
    const db = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const fetchImpl = (async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as any;
    const result = await publishTodayPost(db, 'ev', { text: 'Всем привет! Сегодня играем', game_number: 1 }, fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/sendMessage');
    expect(calls[0].body).toMatchObject({ chat_id: '-100500', message_thread_id: 77, text: 'Всем привет! Сегодня играем' });
    // VK is not configured in tests: the post reached Telegram only.
    expect(result.state).toBe('partial');

    await publishTodayPost(db, 'ev', {}, fetchImpl);
    expect(calls).toHaveLength(1);
    expect((await loadTodayPost(db, 'ev')).telegram_status).toBe('published');

    const route = await loadEveningRoute(db, 'ev', Date.parse('2026-10-02T09:00:00Z'));
    const step = route.stages.find((stage) => stage.id === 'gather')!.steps.find((item) => item.id === 'today-post')!;
    expect(step.title).toContain('дошёл не везде');
    expect(step.action).toBe('today_post');
  });

  it('at 17:00 Moscow asks the organizer when fewer than 4 games are full, once', async () => {
    const db = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const fetchImpl = (async (url: string) => { calls.push(url); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as any;
    // 16:59 MSK: too early.
    expect(await runTodayPostSchedule(db, Date.parse('2026-10-02T13:59:00Z'), fetchImpl)).toBe(0);
    // 17:00 MSK: the evening is short, so nothing is posted and the organizer is asked.
    expect(await runTodayPostSchedule(db, Date.parse('2026-10-02T14:00:00Z'), fetchImpl)).toBe(1);
    expect(calls).toHaveLength(0);
    const post = await loadTodayPost(db, 'ev');
    expect(post.decision_prompt_at).toBeTruthy();
    expect(await runTodayPostSchedule(db, Date.parse('2026-10-02T14:05:00Z'), fetchImpl)).toBe(0);
    const route = await loadEveningRoute(db, 'ev', Date.parse('2026-10-02T14:05:00Z'));
    const step = route.stages.find((stage) => stage.id === 'gather')!.steps.find((item) => item.id === 'today-post')!;
    expect(step.status).toBe('attention');
    expect(step.title).toBe('Играем сегодня? Реши про пост');
    // The evening day is current, but the open decision keeps «Сбор» yellow and opens it first.
    expect(route.current_stage).toBe('day');
    expect(route.stages.find((stage) => stage.id === 'gather')!.state).toBe('attention');
    expect(route.open_stage).toBe('gather');
    await skipTodayPost(db, 'ev');
    const after = await loadEveningRoute(db, 'ev', Date.parse('2026-10-02T14:06:00Z'));
    expect(after.stages.find((stage) => stage.id === 'gather')!.steps.find((item) => item.id === 'today-post')!.status).toBe('done');
  });

  it('at 17:00 Moscow posts by itself when 4 games are full', async () => {
    const db = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const now = new Date().toISOString();
    // Eleven more players for every game.
    for (let index = 0; index < 11; index += 1) {
      await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [`x${index}`, `Игрок ${index}`, now, now]);
      await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,registration_status,response_status,attendance_status,payment_status,created_at,updated_at)
        VALUES (?,?,?,'going','going','pending','unpaid',?,?)`, [`ep-x${index}`, 'ev', `x${index}`, now, now]);
    }
    const calls: any[] = [];
    const fetchImpl = (async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as any;
    expect(await runTodayPostSchedule(db, Date.parse('2026-10-02T14:00:00Z'), fetchImpl)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.text).toContain('Сегодня играем');
    expect((await loadTodayPost(db, 'ev')).telegram_status).toBe('published');
    expect(await runTodayPostSchedule(db, Date.parse('2026-10-02T14:01:00Z'), fetchImpl)).toBe(0);
  });
});
