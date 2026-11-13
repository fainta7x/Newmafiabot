import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { SITE_BLOCKS, listSiteBlocks, loadSiteTexts, resetSiteBlock, resetSiteContentSchemaForTests, saveSiteBlock } from '../server/services/siteContentService.ts';
import { listPostTemplates, resetPostTemplateSchemaForTests } from '../server/services/postTemplateService.ts';

let db: DatabaseWrapper;
beforeEach(() => { resetSiteContentSchemaForTests(); resetPostTemplateSchemaForTests(); db = createDatabaseConnection(':memory:'); });
afterEach(() => { try { db.sqlite.close(); } catch {} });

describe('texts of the club site edited in the CRM', () => {
  it('shows the defaults until a text is saved, then the saved one, then the default again', async () => {
    const before = await loadSiteTexts(db);
    expect(Object.keys(before)).toEqual(SITE_BLOCKS.map((block) => block.key));
    await saveSiteBlock(db, 'about', '  Новый текст  ');
    expect((await loadSiteTexts(db)).about).toBe('Новый текст');
    expect((await listSiteBlocks(db)).find((block) => block.key === 'about')?.customized).toBe(true);
    await resetSiteBlock(db, 'about');
    expect((await loadSiteTexts(db)).about).toBe(before.about);
  });

  it('refuses an empty text and a link that is not https', async () => {
    await expect(saveSiteBlock(db, 'about', '   ')).rejects.toMatchObject({ status: 400 });
    await expect(saveSiteBlock(db, 'telegram_url', 'javascript:alert(1)')).rejects.toMatchObject({ status: 400 });
    await saveSiteBlock(db, 'telegram_url', 'https://t.me/club');
    expect((await loadSiteTexts(db)).telegram_url).toBe('https://t.me/club');
  });

  it('does not leak into the list of post texts that share the table', async () => {
    await saveSiteBlock(db, 'about', 'Текст');
    expect((await listPostTemplates(db)).some((template) => template.key.startsWith('site.'))).toBe(false);
  });
});

describe('public pages of the site read from the app', () => {
  it('sends the saved site texts with the welcome page and a rating table with nicknames only', async () => {
    const { default: request } = await import('supertest');
    const { createApp } = await import('../app.ts');
    await createApp(db);
    const app = await createApp(db);
    await saveSiteBlock(db, 'about', 'Текст из CRM');
    const page = await request(app).get('/api/public/welcome');
    expect(page.status).toBe(200);
    expect(page.body.site.about).toBe('Текст из CRM');
    expect(page.body.site.telegram_url).toMatch(/^https:\/\//);
    const rating = await request(app).get('/api/public/welcome/rating');
    expect(rating.status).toBe(200);
    expect(Array.isArray(rating.body.players)).toBe(true);
    expect(JSON.stringify(rating.body)).not.toMatch(/player_id|avatar|"id"/);
  });
});

describe('novice evening on every Friday (owner, 2026-11-12)', () => {
  it('makes the next three novice Fridays once, keeps a hand-made or cancelled one, and leaves the club evening alone', async () => {
    const { ensureRollingFridayCalendar } = await import('../server/services/weeklyEveningAutomationService.ts');
    const { createApp } = await import('../app.ts');
    await createApp(db);
    const now = new Date('2026-11-12T09:00:00Z'); // Thursday
    const first = await ensureRollingFridayCalendar(db, now, { noviceFridays: true });
    expect(first.created.length).toBeGreaterThan(0);
    const novice = await db.all<any>("SELECT starts_at, ends_at, status, venue FROM game_evenings WHERE format = 'NOVICE' ORDER BY starts_at");
    expect(novice.map((row) => row.starts_at.slice(0, 16))).toEqual(['2026-11-13T19:00', '2026-11-20T19:00', '2026-11-27T19:00']);
    expect(novice.every((row) => row.status === 'published' && row.ends_at.includes('T18:00'))).toBe(true);
    const club = await db.all<any>("SELECT starts_at FROM game_evenings WHERE format = 'CASUAL' AND starts_at LIKE '2026-11-13%'");
    expect(club.map((row) => row.starts_at.slice(11, 16))).toEqual(['21:00']);
    // second run: nothing new
    await ensureRollingFridayCalendar(db, now, { noviceFridays: true });
    expect(Number((await db.get<any>("SELECT COUNT(*) AS n FROM game_evenings WHERE format = 'NOVICE'"))?.n)).toBe(3);
    // a cancelled novice Friday is not replaced
    await db.run("UPDATE game_evenings SET status = 'cancelled' WHERE format = 'NOVICE' AND starts_at LIKE '2026-11-20%'");
    await ensureRollingFridayCalendar(db, now, { noviceFridays: true });
    expect(Number((await db.get<any>("SELECT COUNT(*) AS n FROM game_evenings WHERE format = 'NOVICE' AND starts_at LIKE '2026-11-20%'"))?.n)).toBe(1);
    // the slots exist: two games from 19:00
    const evening = await db.get<any>("SELECT id FROM game_evenings WHERE format = 'NOVICE' AND starts_at LIKE '2026-11-13%'");
    expect(Number((await db.get<any>('SELECT COUNT(*) AS n FROM evening_game_slots WHERE evening_id = ?', [evening.id]))?.n)).toBe(2);
  });
});

describe('«who is signed in» for the club site', () => {
  it('answers a stranger with signed_in false, a signed-in player with the nickname, and sends the cookie only to the club site', async () => {
    const { default: request } = await import('supertest');
    const { createApp } = await import('../app.ts');
    const { generatePlayerSessionToken } = await import('../server/auth.ts');
    const app = await createApp(db);
    await db.run("INSERT INTO players (id, nickname, created_at, updated_at) VALUES ('p-site', 'Алоэ', datetime('now'), datetime('now'))");
    const stranger = await request(app).get('/api/public/welcome/session').set('Origin', 'https://2lamafia.ru');
    expect(stranger.status).toBe(200);
    expect(stranger.body.signed_in).toBe(false);
    expect(stranger.body.login_url).toContain('/player?return=');
    expect(stranger.headers['access-control-allow-credentials']).toBe('true');
    expect(stranger.headers['access-control-allow-origin']).toBe('https://2lamafia.ru');
    const player = await request(app).get('/api/public/welcome/session').set('Origin', 'https://2lamafia.ru').set('Cookie', `player_token=${generatePlayerSessionToken('p-site')}`);
    expect(player.body).toMatchObject({ signed_in: true, nickname: 'Алоэ', organizer: false, crm_url: null });
    expect(JSON.stringify(player.body)).not.toContain('p-site');
    const other = await request(app).get('/api/public/welcome/session').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    expect(other.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('the day and time of the games is a setting (owner, 2026-11-12)', () => {
  it('validates, saves and shows the schedule, and the calendar follows a new day and time', async () => {
    const { DEFAULT_GAME_SCHEDULE, loadGameSchedule, saveGameSchedule, scheduleTimes } = await import('../server/services/gameScheduleSettingsService.ts');
    const { ensureRollingFridayCalendar } = await import('../server/services/weeklyEveningAutomationService.ts');
    const { createApp } = await import('../app.ts');
    await createApp(db);
    expect(await loadGameSchedule(db)).toEqual(DEFAULT_GAME_SCHEDULE);
    await expect(saveGameSchedule(db, { weekday: 9, novice_first_game: '19:00' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(saveGameSchedule(db, { weekday: 4, novice_first_game: '7pm' })).rejects.toMatchObject({ statusCode: 400 });
    expect(scheduleTimes({ weekday: 4, novice_first_game: '20:00' })).toEqual({ briefing: '19:30', first_game: '20:00', novice_end: '22:00', club_start: '22:00' });

    const now = new Date('2026-11-12T09:00:00Z'); // Thursday
    await ensureRollingFridayCalendar(db, now, { noviceFridays: true });
    expect((await db.all<any>("SELECT starts_at FROM game_evenings WHERE format = 'NOVICE' ORDER BY starts_at")).map((row) => row.starts_at.slice(0, 16))[0]).toBe('2026-11-13T19:00');

    const saved = await saveGameSchedule(db, { weekday: 4, novice_first_game: '20:00' });
    expect(saved.schedule).toEqual({ weekday: 4, novice_first_game: '20:00' });
    expect(saved.upcoming_on_old_day).toBeGreaterThan(0); // the Fridays made earlier are reported, not moved
    await ensureRollingFridayCalendar(db, now, { noviceFridays: true });
    const thursday = await db.all<any>("SELECT starts_at FROM game_evenings WHERE format = 'NOVICE' AND starts_at LIKE '2026-11-12%' OR (format = 'NOVICE' AND starts_at LIKE '2026-11-19%')");
    expect(thursday.some((row) => row.starts_at.startsWith('2026-11-19T20:00'))).toBe(true);
    const club = await db.all<any>("SELECT starts_at FROM game_evenings WHERE format = 'CASUAL' AND starts_at LIKE '2026-11-19%'");
    expect(club.map((row) => row.starts_at.slice(11, 16))).toEqual(['22:00']);
  });
});

describe('club agenda, evening history and tournament results for the site', () => {
  it('shows open evenings of every format with free seats, and never a cancelled or closed one', async () => {
    const { loadSiteAgenda } = await import('../server/services/siteClubService.ts');
    const now = new Date(Date.now() + 86_400_000).toISOString();
    await db.run("INSERT INTO game_evenings (id, title, starts_at, format, status, capacity, created_at, updated_at) VALUES ('a','Клубный вечер',?, 'CASUAL','published',10,?,?)", [now, now, now]);
    await db.run("INSERT INTO game_evenings (id, title, starts_at, format, status, capacity, created_at, updated_at) VALUES ('b','Турнир',?, 'TOURNAMENT','cancelled',10,?,?)", [now, now, now]);
    const items = await loadSiteAgenda(db);
    expect(items.map((item) => item.id)).toEqual(['a']);
    expect(items[0]).toMatchObject({ format: 'CASUAL', free_seats: 10 });
  });

  it('answers the three public routes without roles or contacts', async () => {
    const { default: request } = await import('supertest');
    const { createApp } = await import('../app.ts');
    const app = await createApp(db);
    for (const path of ['agenda', 'history', 'tournaments']) {
      const response = await request(app).get(`/api/public/welcome/${path}`);
      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toMatch(/phone|telegram_user_id|role/i);
    }
  });
});

describe('result pictures for the site', () => {
  it('draws nothing for an unknown, open or hidden evening or tournament', async () => {
    const { default: request } = await import('supertest');
    const { createApp } = await import('../app.ts');
    const app = await createApp(db);
    expect((await request(app).get('/api/public/welcome/history/none/image.png')).status).toBe(404);
    expect((await request(app).get('/api/public/welcome/tournaments/none/image.png')).status).toBe(404);
  });
});
