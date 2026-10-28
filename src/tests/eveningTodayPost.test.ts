import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { buildTodayPostDraft, loadTodayPost, publishTodayPost, runTodayPostSchedule, skipTodayPost } from '../server/services/eveningTodayPostService.ts';
import { loadEveningRoute } from '../server/services/eveningRouteService.ts';
import { addAnnouncementPhoto } from '../server/services/announcementPhotoService.ts';
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

// Eleven more players registered for the first `games` games: those games have a full table.
async function fillGames(db: DatabaseWrapper, games: number) {
  const now = new Date().toISOString();
  const plan = await loadEveningSlotPlan(db, 'ev');
  for (let index = 0; index < 11; index += 1) {
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [`f${index}`, `Игрок ${index}`, now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,registration_status,response_status,attendance_status,payment_status,created_at,updated_at)
      VALUES (?,?,?,'going','going','pending','unpaid',?,?)`, [`ep-f${index}`, 'ev', `f${index}`, now, now]);
    await db.run("DELETE FROM evening_slot_registrations WHERE participant_id = ?", [`ep-f${index}`]);
    for (const slot of plan.slots.slice(0, games)) {
      await db.run('INSERT INTO evening_slot_registrations (id, slot_id, participant_id, created_at, updated_at) VALUES (?,?,?,?,?)', [`rf-${index}-${slot.id}`, slot.id, `ep-f${index}`, now, now]);
    }
  }
}

describe('NOVICE gathering rules', () => {
  it('repairs old 4-game readiness to 2 games of 9 including judge, and enables post', async () => {
    const db = await setup();
    const now = new Date().toISOString();
    await db.run("UPDATE game_evenings SET format = 'NOVICE' WHERE id = 'ev'");
    // Legacy settings previously created under CASUAL with 4 required games.
    await loadEveningSlotPlan(db, 'ev');
    await db.run("UPDATE evening_slot_settings SET ready_slots_required = 4, ready_players_per_slot = 11 WHERE evening_id = 'ev'");
    // First two games now have nine participants, including existing confirmed arrivals.
    const plan = await loadEveningSlotPlan(db, 'ev');
    expect(plan.event.required_slots).toBe(2);
    expect(plan.event.required_players_per_slot).toBe(9);
    const firstTwo = plan.slots.slice(0, 2);
    for (let i = 0; i < 7; i++) {
      const id = `nv${i}`;
      await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [id,id,now,now]);
      await db.run("INSERT INTO evening_participants (id,evening_id,player_id,registration_status,response_status,attendance_status,payment_status,created_at,updated_at) VALUES (?,?,?,'going','going','pending','unpaid',?,?)", [`ep-${id}`,'ev',id,now,now]);
      for (const slot of firstTwo) await db.run('INSERT OR IGNORE INTO evening_slot_registrations (id,slot_id,participant_id,created_at,updated_at) VALUES (?,?,?,?,?)', [`r-${id}-${slot.id}`,slot.id,`ep-${id}`,now,now]);
    }
    const ready = await loadEveningSlotPlan(db, 'ev');
    expect(ready.event.assembled).toBe(true);
    expect(ready.event.assembled_slots).toBeGreaterThanOrEqual(2);
    const route = await loadEveningRoute(db, 'ev', Date.parse('2026-10-02T14:00:00Z'));
    const gather = route.stages.find(stage => stage.id === 'gather');
    expect(gather?.steps.find(item => item.id === 'shortfall')?.title).not.toContain('Недобор');
  });
});

describe('«Сегодня играем» post', () => {
  it('allows configuration repair without turning a proven unsent request into uncertainty',async()=>{
    const db=await setup();vi.stubEnv('TELEGRAM_BOT_TOKEN','');
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({ok:true,result:{message_id:11}})));
    await publishTodayPost(db,'ev',{text:'Original'},fetchImpl);expect(fetchImpl).not.toHaveBeenCalled();
    vi.stubEnv('TELEGRAM_BOT_TOKEN','test-token');
    expect((await publishTodayPost(db,'ev',{},fetchImpl)).telegram_status).toBe('published');expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('two clicks claim one channel with the first saved text',async()=>{
    const db=await setup();vi.stubEnv('TELEGRAM_BOT_TOKEN','test-token');
    const fetchImpl=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{expect(JSON.parse(String(init?.body)).text).toBe('First');return new Response(JSON.stringify({ok:true,result:{message_id:12}}));});
    await Promise.all([publishTodayPost(db,'ev',{text:'First'},fetchImpl),publishTodayPost(db,'ev',{text:'Second'},fetchImpl)]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);expect((await loadTodayPost(db,'ev')).telegram_status).toBe('published');
  });
  it('builds a bright text with the chosen game, the roster and a call to join', async () => {
    const db = await setup();
    const draft = await buildTodayPostDraft(db, 'ev', 2);
    expect(draft.game_number).toBe(2);
    expect(draft.text).toContain('Всем привет! Сегодня играем');
    expect(draft.text).toContain('Ждём всех к 2-й игре — в 22:00');
    expect(draft.text).toContain('📍 Суп с Котом');
    expect(draft.text).toContain('Состав (3)');
    expect(draft.text).toContain('Аня');
    expect(draft.text).toContain('Борис');
    expect(draft.text).not.toContain('Борис (подойдёт позже)');
    expect(draft.text).toContain('Вера (с 3-й игры)');
    // A legacy late RSVP with a normal first-game slot is not a confirmed later arrival.
    expect(draft.text).not.toContain('подойдёт позже');
    expect(draft.text).not.toContain('Гоша');
    expect(draft.text).toMatch(/не хватает \d+ человек/);
  });

  it('puts the club photo above the text, and sends no preview when there is no photo (owner, 2026-10-05)', async () => {
    const db = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const fetchImpl = (async (_url: string, init: any) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true, result:{message_id:100} }), { status: 200 }); }) as any;
    await publishTodayPost(db, 'ev', { text: 'Сегодня играем' }, fetchImpl);
    expect(calls[0].disable_web_page_preview).toBe(true);
    expect(calls[0].link_preview_options).toBeUndefined();

    await db.run("DELETE FROM evening_today_posts WHERE evening_id = 'ev'");
    await db.run("DELETE FROM publication_deliveries WHERE delivery_key LIKE 'today:ev:%'");
    const photo = await addAnnouncementPhoto(db, { base64: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64'), audience: 'NOVICE' });
    await publishTodayPost(db, 'ev', { text: 'Сегодня играем' }, fetchImpl);
    expect(calls[1].disable_web_page_preview).toBeUndefined();
    expect(calls[1].link_preview_options).toEqual({ url: expect.stringMatching(new RegExp(`^https://.*/announce-photo/${photo.id}\\.jpg$`)), prefer_large_media: true, show_above_text: true });
  });

  it('publishes to the evening group once and shows in the route', async () => {
    const db = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const fetchImpl = (async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true, result:{message_id:100} }), { status: 200 }); }) as any;
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

  it('at 17:00 Moscow asks the organizer when 3 of 4 games are full, once', async () => {
    const db = await setup();
    await fillGames(db, 3);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const fetchImpl = (async (url: string) => { calls.push(url); return new Response(JSON.stringify({ ok: true, result:{message_id:100} }), { status: 200 }); }) as any;
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
    // «День вечера» was absorbed into gathering; its pending decision opens that stage.
    expect(route.current_stage).toBe('gather');
    expect(route.stages.find((stage) => stage.id === 'gather')!.state).toBe('current');
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
    const fetchImpl = (async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true, result:{message_id:100} }), { status: 200 }); }) as any;
    expect(await runTodayPostSchedule(db, Date.parse('2026-10-02T14:00:00Z'), fetchImpl)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.text).toContain('Сегодня играем');
    expect((await loadTodayPost(db, 'ev')).telegram_status).toBe('published');
    expect(await runTodayPostSchedule(db, Date.parse('2026-10-02T14:01:00Z'), fetchImpl)).toBe(0);
  });

  it('at 17:00 Moscow cancels by itself when no game has a full table and the evening is under the minimum', async () => {
    const db = await setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const fetchImpl = (async (_url: string, init: any) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true, result:{message_id:100} }), { status: 200 }); }) as any;
    expect(await runTodayPostSchedule(db, Date.parse('2026-10-02T14:00:00Z'), fetchImpl)).toBe(1);
    expect((await db.get<any>("SELECT status FROM game_evenings WHERE id = 'ev'")).status).toBe('cancelled');
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('отменяется');
    expect(await runTodayPostSchedule(db, Date.parse('2026-10-02T14:01:00Z'), fetchImpl)).toBe(0);
  });

  it('turns «Сбор» green once the organizer decided to play', async () => {
    const db = await setup();
    await fillGames(db, 3);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const fetchImpl = (async () => new Response(JSON.stringify({ ok: true, result:{message_id:100} }), { status: 200 })) as any;
    const before = await loadEveningRoute(db, 'ev', Date.parse('2026-10-02T14:05:00Z'));
    expect(before.stages.find((stage) => stage.id === 'gather')!.steps.find((item) => item.id === 'shortfall')!.status).toBe('attention');
    await publishTodayPost(db, 'ev', { text: 'Играем!' }, fetchImpl);
    const after = await loadEveningRoute(db, 'ev', Date.parse('2026-10-02T14:06:00Z'));
    const shortfall = after.stages.find((stage) => stage.id === 'gather')!.steps.find((item) => item.id === 'shortfall')!;
    expect(shortfall.status).toBe('done');
    expect(shortfall.title).toContain('решение организатора');
  });
});
