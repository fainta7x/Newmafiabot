import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { removeLead, createWelcomeLead, loadNewcomerFunnel, normalizeLeadContact, recordWelcomeVisit } from '../server/services/newcomerFunnelService.ts';
import { loadAgenda, recordAgendaContact } from '../server/services/organizerAgendaService.ts';

describe('newcomer funnel, welcome page leads and ready messages (owner, 2026-11-11)', () => {
  let db: DatabaseWrapper;
  const now = new Date('2026-11-12T12:00:00Z');
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await createApp(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('normalizes the three kinds of contact and refuses nonsense', () => {
    expect(normalizeLeadContact('telegram', 't.me/ivan_ivanov')).toEqual({ kind: 'telegram', value: '@ivan_ivanov' });
    expect(normalizeLeadContact('telegram', '@Ivan_Ivanov')).toEqual({ kind: 'telegram', value: '@Ivan_Ivanov' });
    expect(normalizeLeadContact('vk', 'https://vk.com/ivan.petrov')).toEqual({ kind: 'vk', value: 'https://vk.com/ivan.petrov' });
    expect(normalizeLeadContact('phone', '8 (900) 123-45-67')).toEqual({ kind: 'phone', value: '+79001234567' });
    expect(() => normalizeLeadContact('telegram', 'я')).toThrow();
    expect(() => normalizeLeadContact('phone', '12345')).toThrow();
    expect(() => normalizeLeadContact('email', 'a@b.c')).toThrow();
  });

  it('creates one lead per contact, a novice player, and counts the page opens once a day', async () => {
    const first = await createWelcomeLead(db, { name: 'Иван', contactKind: 'telegram', contactValue: '@ivan_tg', source: 'vk', referredBy: 'Алоэ' }, now);
    const again = await createWelcomeLead(db, { name: 'Иван другой', contactKind: 'telegram', contactValue: 't.me/ivan_tg' }, now);
    expect(first.created).toBe(true); expect(again).toEqual({ playerId: first.playerId, created: false, booked: false, alreadyBooked: false });
    const second = await createWelcomeLead(db, { name: 'Иван', contactKind: 'phone', contactValue: '+7 900 111-22-33' }, now);
    const nicknames = (await db.all<any>("SELECT nickname FROM players WHERE source = 'welcome_page' ORDER BY nickname")).map((row) => row.nickname);
    expect(nicknames).toEqual(['Иван', 'Иван 2']);
    const player = await db.get<any>('SELECT game_level, club_stage, lifecycle_status, referred_by, telegram_username FROM players WHERE id = ?', [first.playerId]);
    expect(player).toMatchObject({ game_level: 'novice', club_stage: 'NEW', lifecycle_status: 'newcomer', referred_by: 'Алоэ', telegram_username: '@ivan_tg' });
    expect(second.created).toBe(true);
    expect(await recordWelcomeVisit(db, { visitorId: 'visitor-123456', source: 'vk' }, now)).toBe(true);
    expect(await recordWelcomeVisit(db, { visitorId: 'visitor-123456', source: 'vk' }, now)).toBe(false);
    expect(await recordWelcomeVisit(db, { visitorId: 'x' }, now)).toBe(false);
  });

  it('counts the funnel from page opens to the second visit and splits it by source', async () => {
    const lead = await createWelcomeLead(db, { name: 'Анна', contactKind: 'vk', contactValue: 'vk.com/anna_k', source: 'friend' }, now);
    await recordWelcomeVisit(db, { visitorId: 'visitor-aaaaaa', source: 'friend' }, now);
    await recordWelcomeVisit(db, { visitorId: 'visitor-bbbbbb', source: 'vk' }, now);
    const stamp = now.toISOString();
    for (const [id, offset] of [['e1', -14], ['e2', -7]] as const) {
      const starts = new Date(now.getTime() + offset * 86_400_000).toISOString();
      await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES (?,?,?,'Europe/Moscow','NOVICE','completed',20,200,?,?)`, [id, id, starts, stamp, stamp]);
      await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES (?,?,?,'going','going','attended','on_time','paid',0,0,?,?)`, [`p-${id}`, id, lead.playerId, stamp, stamp]);
    }
    const funnel = await loadNewcomerFunnel(db, 90, now);
    expect(funnel.steps.map((step) => [step.key, step.count])).toEqual([['page_view', 2], ['joined', 1], ['signed', 1], ['first_visit', 1], ['second_visit', 1]]);
    expect(funnel.sources).toEqual([{ source: 'friend', label: 'Привёл знакомый', leads: 1, came: 1 }]);
  });

  it('puts a new lead first in «Дела» with a ready message and removes it after «Написал»', async () => {
    const stamp = now.toISOString();
    const starts = new Date(now.getTime() + 2 * 86_400_000).toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,venue,format,status,capacity,default_price,created_at,updated_at) VALUES ('nov','Новички',?,'Europe/Moscow','Суп с Котом','NOVICE','published',20,200,?,?)`, [starts, stamp, stamp]);
    const lead = await createWelcomeLead(db, { name: 'Мария', contactKind: 'telegram', contactValue: '@maria_tg', source: 'vk' }, now);
    const agenda = await loadAgenda(db, now.getTime());
    const item = agenda.items.find((entry) => entry.id === 'people:lead');
    expect(item?.group).toBe('now');
    const person = item?.people?.[0];
    expect(person).toMatchObject({ nickname: 'Мария', telegram_url: 'https://t.me/maria_tg' });
    expect(person?.message).toContain('Привет, Мария!');
    expect(person?.message).toContain('Суп с Котом');
    // the lead is sent to the club site (the sign-up), not to the app
    expect(person?.message).toContain('https://2lamafia.ru/?src=friend#join');
    await recordAgendaContact(db, { playerId: lead.playerId, reason: 'lead' });
    expect((await loadAgenda(db, now.getTime())).items.find((entry) => entry.id === 'people:lead')).toBeUndefined();
  });

  it('serves the public welcome page data and accepts a lead, ignoring the hidden trap field', async () => {
    const app = await createApp(db);
    const page = await request(app).get('/api/public/welcome');
    expect(page.status).toBe(200);
    expect(page.body.content.title).toContain('спортивной мафии');
    const trapped = await request(app).post('/api/public/welcome/lead').send({ name: 'Бот', contact_kind: 'telegram', contact_value: '@spam_bot_x', website: 'http://spam' });
    expect(trapped.status).toBe(200);
    expect(Number((await db.get<any>('SELECT COUNT(*) AS n FROM players WHERE source = ?', ['welcome_page']))?.n)).toBe(0);
    const bad = await request(app).post('/api/public/welcome/lead').send({ name: 'Иван', contact_kind: 'telegram', contact_value: 'x' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/public/welcome/lead').send({ name: 'Иван', contact_kind: 'telegram', contact_value: '@ivan_real', source: 'vk' });
    expect(ok.status).toBe(201);
    expect(Number((await db.get<any>('SELECT COUNT(*) AS n FROM players WHERE source = ?', ['welcome_page']))?.n)).toBe(1);
  });
});

describe('«Новый лид» from the bot and the organizer notification (owner, 2026-11-11)', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => { process.env.BOT_API_SECRET = 'secret'; process.env.ORGANIZER_NOTIFICATION_IDS = '777'; db = createDatabaseConnection(':memory:'); await createApp(db); });
  afterEach(() => { delete process.env.BOT_API_SECRET; delete process.env.ORGANIZER_NOTIFICATION_IDS; try { db.sqlite.close(); } catch {} });

  it('recognizes what kind of contact the organizer typed', async () => {
    const { detectLeadContactKind } = await import('../server/services/newcomerFunnelService.ts');
    expect(detectLeadContactKind('@ivan_tg')).toBe('telegram');
    expect(detectLeadContactKind('t.me/ivan_tg')).toBe('telegram');
    expect(detectLeadContactKind('vk.com/anna_k')).toBe('vk');
    expect(detectLeadContactKind('+7 900 123-45-67')).toBe('phone');
    expect(detectLeadContactKind('привет')).toBeNull();
  });

  it('adds a lead from the bot for an organizer only and answers with the ready message', async () => {
    const app = await createApp(db);
    const stranger = await request(app).post('/api/bot/leads').set('X-Bot-Token', 'secret').send({ telegram_user_id: 555, name: 'Иван', contact: '@ivan_tg' });
    expect(stranger.status).toBe(403);
    const ok = await request(app).post('/api/bot/leads').set('X-Bot-Token', 'secret').send({ telegram_user_id: 777, name: 'Иван', contact: '@ivan_tg' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body).toMatchObject({ success: true, created: true, nickname: 'Иван', contact: '@ivan_tg', contact_kind: 'telegram' });
    expect(ok.body.message).toContain('Привет, Иван!');
    expect(ok.body.welcome_url).toBe('https://2lamafia.ru/?src=friend#join');
    const again = await request(app).post('/api/bot/leads').set('X-Bot-Token', 'secret').send({ telegram_user_id: 777, name: 'Иван', contact: 't.me/ivan_tg' });
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    const bad = await request(app).post('/api/bot/leads').set('X-Bot-Token', 'secret').send({ telegram_user_id: 777, name: 'Иван', contact: 'привет' });
    expect(bad.status).toBe(400);
  });

  it('tells the organizer about a lead who registered himself, with the ready message and a chat button', async () => {
    const app = await createApp(db);
    const response = await request(app).post('/api/public/welcome/lead').send({ name: 'Мария', contact_kind: 'telegram', contact_value: '@maria_tg', source: 'vk' });
    expect(response.status).toBe(201);
    const queued = await db.get<any>("SELECT chat_id, text, reply_markup_json FROM telegram_message_outbox WHERE event_type = 'new_lead'");
    expect(String(queued?.chat_id)).toBe('777');
    expect(queued.text).toContain('Новый лид: Мария');
    expect(queued.text).toContain('Пост ВКонтакте');
    expect(queued.text).toContain('Привет, Мария!');
    expect(String(queued.reply_markup_json)).toContain('https://t.me/maria_tg');
  });
});

describe('live seats and photos of the welcome page (owner, 2026-11-11)', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await createApp(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('shows who has taken seats at the nearest novice evening, and club photos at the top', async () => {
    const app = await createApp(db);
    const stamp = new Date().toISOString();
    const starts = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,venue,format,status,capacity,default_price,created_at,updated_at) VALUES ('nov','Новички',?,'Europe/Moscow','Суп с Котом','NOVICE','published',20,200,?,?)`, [starts, stamp, stamp]);
    for (const [id, nick] of [['a', 'Алоэ'], ['b', 'Богдан']]) {
      await db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at) VALUES (?,?, 'normal','test',1000,0,?,?)`, [id, nick, stamp, stamp]);
      await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES (?,'nov',?,'going','going','pending','unknown','waived',0,0,?,?)`, ['p' + id, id, stamp, stamp]);
    }
    await db.run("CREATE TABLE IF NOT EXISTS announcement_photos (id TEXT PRIMARY KEY, audience TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL)");
    await db.run("INSERT INTO announcement_photos (id, audience, mime, bytes, size, created_at) VALUES ('11111111-1111-1111-1111-111111111111','all','image/jpeg',x'00',1,?)", [stamp]);
    const seats = await request(app).get('/api/public/welcome/seats');
    expect(seats.status).toBe(200);
    expect(seats.body.evening_id).toBe('nov');
    expect(seats.body.going).toBe(2);
    expect(seats.body.games.length).toBeGreaterThan(0);
    expect(seats.body.games[0]).toMatchObject({ taken: 2 });
    expect(seats.body.games[0].people).toEqual(expect.arrayContaining(['Алоэ', 'Богдан']));
    const page = await request(app).get('/api/public/welcome');
    expect(page.body.hero_photos).toHaveLength(1);
    expect(page.body.hero_photos[0]).toMatch(/announce-photo\/11111111-1111-1111-1111-111111111111\.jpg$/);
    expect(page.body.evening.price).toContain('Первые 2 вечера бесплатно');
  });

  it('answers with no games when there is no novice evening', async () => {
    const app = await createApp(db);
    const seats = await request(app).get('/api/public/welcome/seats');
    expect(seats.status).toBe(200);
    expect(seats.body).toMatchObject({ evening_id: null, games: [], going: 0 });
  });
});

describe('the welcome page on the club site (owner, 2026-11-11)', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await createApp(db); });
  afterEach(() => { delete process.env.WELCOME_SITE_URL; try { db.sqlite.close(); } catch {} });

  it('answers the site, and only the site, on the welcome routes', async () => {
    const app = await createApp(db);
    const preflight = await request(app).options('/api/public/welcome/lead').set('Origin', 'https://fainta7x.github.io').set('Access-Control-Request-Method', 'POST');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://fainta7x.github.io');
    const read = await request(app).get('/api/public/welcome').set('Origin', 'https://fainta7x.github.io');
    expect(read.headers['access-control-allow-origin']).toBe('https://fainta7x.github.io');
    const stranger = await request(app).get('/api/public/welcome').set('Origin', 'https://evil.example');
    expect(stranger.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends the old /welcome link to the site and keeps where the person came from', async () => {
    const app = await createApp(db);
    const moved = await request(app).get('/welcome?src=vk&ref=%D0%90%D0%BB%D0%BE%D1%8D');
    expect(moved.status).toBe(302);
    expect(moved.headers.location).toBe('https://2lamafia.ru/?src=vk&ref=%D0%90%D0%BB%D0%BE%D1%8D#join');
    const plain = await request(app).get('/welcome');
    expect(plain.headers.location).toBe('https://2lamafia.ru/#join');
  });
});

describe('choosing a Friday on the site (owner, 2026-11-12)', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await createApp(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });
  const evening = (id: string, hours: number, status = 'published') => {
    const stamp = new Date().toISOString();
    return db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,venue,format,status,capacity,default_price,created_at,updated_at) VALUES (?,?,?,'Europe/Moscow','Суп с Котом','NOVICE',?,20,200,?,?)`,
      [id, id, new Date(Date.now() + hours * 3600_000).toISOString(), status, stamp, stamp]);
  };

  it('lists the open novice evenings, takes the chosen one with the lead and names it in the organizer message; a bad id is ignored', async () => {
    await evening('fri1', 24); await evening('fri2', 24 * 8); await evening('old', 48, 'completed');
    const { default: request } = await import('supertest');
    const app = await createApp(db);
    const page = await request(app).get('/api/public/welcome');
    expect(page.body.evenings.map((row: any) => row.id)).toEqual(['fri1', 'fri2']);
    const seats = await request(app).get('/api/public/welcome/seats?evening=fri2');
    expect(seats.body.evening_id).toBe('fri2');
    expect((await request(app).get('/api/public/welcome/seats?evening=old')).body.evening_id).toBeNull();

    const ok = await request(app).post('/api/public/welcome/lead').send({ name: 'Иван', contact_kind: 'telegram', contact_value: '@ivan_pick', evening_id: 'fri2' });
    expect(ok.status).toBe(201);
    const stored = await db.get<any>('SELECT evening_id FROM newcomer_leads');
    expect(stored.evening_id).toBe('fri2');
    expect(ok.body.booked).toBe(true);
    const taken = await request(app).get('/api/public/welcome/seats?evening=fri2');
    expect(taken.body.going).toBe(1);
    expect(taken.body.games.every((game: any) => game.people.includes('Иван'))).toBe(true);
    const bad = await request(app).post('/api/public/welcome/lead').send({ name: 'Пётр', contact_kind: 'telegram', contact_value: '@petr_pick', evening_id: 'old' });
    expect(bad.status).toBe(201);
    expect((await db.get<any>("SELECT evening_id FROM newcomer_leads WHERE contact_value = '@petr_pick'")).evening_id).toBeNull();
    // a stranger who knows the contact cannot move the booking: it stays on the first Friday and the answer says so
    const moved = await createWelcomeLead(db, { name: 'Иван', contactKind: 'telegram', contactValue: '@ivan_pick', eveningId: 'fri1' });
    expect(moved).toMatchObject({ created: false, booked: false, alreadyBooked: true });
    expect((await db.get<any>("SELECT evening_id FROM newcomer_leads WHERE contact_value = '@ivan_pick'")).evening_id).toBe('fri2');
    expect((await request(app).get('/api/public/welcome/seats?evening=fri2')).body.going).toBe(1);
    expect((await request(app).get('/api/public/welcome/seats?evening=fri1')).body.going).toBe(0);
    const same = await createWelcomeLead(db, { name: 'Иван', contactKind: 'telegram', contactValue: '@ivan_pick', eveningId: 'fri2' });
    expect(same).toMatchObject({ booked: true, alreadyBooked: true });
    const agenda = await loadAgenda(db);
    const text = JSON.stringify(agenda);
    expect(text).toContain('Иван');
  });
});

describe('removing a lead and the message for a booked lead (owner, 2026-11-12)', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await createApp(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('says «записали» to a lead who picked a Friday, frees the seat on removal and archives the person; a person who played cannot be removed', async () => {
    const stamp = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,venue,format,status,capacity,default_price,created_at,updated_at) VALUES ('fr','Новички',?,'Europe/Moscow','Суп с Котом','NOVICE','published',20,200,?,?)`, [new Date(Date.now() + 48 * 3600_000).toISOString(), stamp, stamp]);
    const lead = await createWelcomeLead(db, { name: 'Лид Один', contactKind: 'telegram', contactValue: '@lead_one_x', eveningId: 'fr' });
    expect(lead.booked).toBe(true);
    const agenda = JSON.stringify(await loadAgenda(db));
    expect(agenda).toContain('Записали тебя на');
    expect(agenda).not.toContain('Записать тебя');
    await removeLead(db, lead.playerId);
    expect(await db.get<any>('SELECT 1 AS x FROM newcomer_leads WHERE player_id = ?', [lead.playerId])).toBeFalsy();
    expect(Number((await db.get<any>('SELECT COUNT(*) AS n FROM evening_participants WHERE player_id = ?', [lead.playerId]))?.n)).toBe(0);
    expect((await db.get<any>('SELECT lifecycle_status FROM players WHERE id = ?', [lead.playerId])).lifecycle_status).toBe('archived');
    await expect(removeLead(db, lead.playerId)).rejects.toMatchObject({ statusCode: 404 });

    const second = await createWelcomeLead(db, { name: 'Лид Два', contactKind: 'telegram', contactValue: '@lead_two_x', eveningId: 'fr' });
    await db.run("UPDATE evening_participants SET attendance_status = 'attended' WHERE player_id = ?", [second.playerId]);
    await expect(removeLead(db, second.playerId)).rejects.toMatchObject({ statusCode: 409 });
  });
});
