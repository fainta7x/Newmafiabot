import { getPublicAppBaseUrl } from '../server/runtimeConfig.ts';
import { loadInvitationContextsForRecipients } from '../server/services/playerInvitationEligibilityService.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { DEFAULT_EVENING_PRICES, eveningSelectionPrice } from '../lib/eveningPrices.ts';
import { isOpenEvening } from '../lib/eveningStatus.ts';
import { loadEveningPrices, savePriceSettings } from '../server/services/eveningPriceSettingsService.ts';
import { buildDirectVkEveningAnnouncement } from '../server/services/vkDirectJoinPublishingService.ts';
import { savePostTemplate } from '../server/services/postTemplateService.ts';
import { ensureSlotsForEvening, reconcileNoviceEveningCharges } from '../server/services/eveningSlotPlanningService.ts';
const opened: DatabaseWrapper[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const db of opened.splice(0)) db.sqlite.close(); });
async function setup() { const db = createDatabaseConnection(':memory:'); opened.push(db); const app = await createApp(db); return { db, app }; }
async function evening(db: DatabaseWrapper, id: string, status = 'published', format = 'CASUAL', created = new Date().toISOString()) {
  await db.run('INSERT INTO game_evenings (id,title,starts_at,format,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [id, id, '2026-01-01T18:00:00Z', format, status, created, created]);
}
const owner = () => `organizer_token=${generateOrganizerToken()}`;

describe('owner-approved evening domain', () => {
  it('validates organizer settings; a new price applies at once to every evening that is not closed', async () => {
    const { db, app } = await setup();
    await evening(db, 'old', 'completed', 'CASUAL', '2020-01-01T00:00:00Z');
    await evening(db, 'upcoming', 'published', 'CASUAL', '2020-01-01T00:00:00Z');
    const policy = { ...DEFAULT_EVENING_PRICES, casual_game: 150, casual_cap: 600, novice_game: 250, novice_cap: 500, rating_entry: 700 };
    expect((await request(app).put('/api/evening-prices').send(policy)).status).toBe(401);
    expect((await request(app).put('/api/evening-prices').set('Cookie', owner()).send({ ...policy, casual_game: -1 })).status).toBe(400);
    expect((await request(app).put('/api/evening-prices').set('Cookie', owner()).send(policy)).status).toBe(200);
    await evening(db, 'new', 'published', 'CASUAL', '2099-01-01T00:00:00Z');
    // The closed evening keeps the price it was closed with; the open ones, old and new, follow the settings.
    expect(await loadEveningPrices(db, 'old')).toEqual(DEFAULT_EVENING_PRICES);
    expect(await loadEveningPrices(db, 'upcoming')).toEqual(policy);
    expect(await loadEveningPrices(db, 'new')).toEqual(policy);
    const plan = await ensureSlotsForEvening(db, 'new');
    expect(plan.settings.price_per_game).toBe(150);
    expect(plan.slots.every((slot: any) => slot.price_rub === 150)).toBe(true);
    expect(eveningSelectionPrice('CASUAL', [150, 150, 150, 150, 150], policy)).toBe(600);
    expect(eveningSelectionPrice('NOVICE', [250, 250, 250], policy)).toBe(500);
    await savePriceSettings(db, { ...policy, casual_game: 300 });
    expect((await loadEveningPrices(db, 'new')).casual_game).toBe(300);
    expect(await loadEveningPrices(db, 'old')).toEqual(DEFAULT_EVENING_PRICES);
    // Closing an evening freezes the tariff it was closed under; a later change does not reach it.
    await db.run("UPDATE game_evenings SET status = 'completed' WHERE id = 'new'");
    await savePriceSettings(db, { ...policy, casual_game: 500 });
    expect((await loadEveningPrices(db, 'new')).casual_game).toBe(300);
    expect((await loadEveningPrices(db, 'upcoming')).casual_game).toBe(500);
  });

  it('a saved price reaches the amounts due of an upcoming novice evening at once', async () => {
    const { db, app } = await setup();
    const stamp = new Date().toISOString();
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await db.run('INSERT INTO game_evenings (id,title,starts_at,format,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', ['nov', 'nov', future, 'NOVICE', 'published', stamp, stamp]);
    await db.run("INSERT INTO players (id,nickname,game_level,created_at,updated_at) VALUES ('p','Новичок','novice',?,?)", [stamp, stamp]);
    await ensureSlotsForEvening(db, 'nov');
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,amount_due,amount_paid,payment_status,created_at,updated_at) VALUES ('ep','nov','p','going',0,0,'unpaid',?,?)", [stamp, stamp]);
    await reconcileNoviceEveningCharges(db, 'nov');
    const before = Number((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep'"))?.amount_due);
    expect(before).toBeGreaterThan(0);
    expect((await request(app).put('/api/evening-prices').set('Cookie', owner()).send({ ...DEFAULT_EVENING_PRICES, novice_game: DEFAULT_EVENING_PRICES.novice_game * 2 })).status).toBe(200);
    expect(Number((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep'"))?.amount_due)).toBe(before * 2);
  });

  it('keeps explicit novice gifts, can revoke them, and never grants them by visit count', async () => {
    const { db, app } = await setup();
    await evening(db, 'gift', 'published', 'NOVICE');
    const stamp = new Date().toISOString();
    await db.run("INSERT INTO players (id,nickname,game_level,created_at,updated_at) VALUES ('newbie','Новичок','novice',?,?)", [stamp, stamp]);
    await ensureSlotsForEvening(db, 'gift');
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,attendance_status,amount_due,amount_paid,payment_status,created_at,updated_at) VALUES ('ep','gift','newbie','going','attended',0,0,'unpaid',?,?)", [stamp, stamp]);
    await reconcileNoviceEveningCharges(db, 'gift');
    expect((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep'"))?.amount_due).toBe(400);
    const gift = await request(app).patch('/api/evenings/gift/payments/ep').set('Cookie', owner()).send({ waived: true });
    expect(gift.status).toBe(200);
    await reconcileNoviceEveningCharges(db, 'gift');
    expect((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep'"))?.amount_due).toBe(0);
    expect((await request(app).patch('/api/evenings/gift/payments/ep').set('Cookie', owner()).send({ waived: false })).status).toBe(200);
    expect((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id='ep'"))?.amount_due).toBe(400);
  });

  it('the public bot router offers the next evening first; an unclosed past evening is the fallback only', async () => {
    const { db, app } = await setup();
    vi.stubEnv('BOT_API_SECRET', 'evening-domain-test');
    const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    const add = (id: string, startsAt: string) => db.run('INSERT INTO game_evenings (id,title,starts_at,format,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [id, id, startsAt, 'NOVICE', 'published', at(-30), at(-30)]);
    await add('past-unclosed', at(-7));
    const router = () => request(app).get('/api/bot/telegram/public-router').set('X-Bot-Token', 'evening-domain-test');
    expect((await router()).body.novice_evening?.id).toBe('past-unclosed');
    await add('next', at(7));
    await add('later', at(14));
    expect((await router()).body.novice_evening?.id).toBe('next');
  });

  it('each evening format has its own VK post; the template is the club post, prices come from the settings', async () => {
    const { db, app } = await setup();
    vi.stubEnv('BOT_API_SECRET', 'evening-domain-test');
    await savePriceSettings(db, { ...DEFAULT_EVENING_PRICES, casual_game: 150, casual_cap: 600, novice_game: 250, rating_entry: 700 });
    await savePostTemplate(db, 'vk_club_evening', 'Приходи <друг>! {название}\n{цена}\n{ссылка}');
    const post = async (format: string) => {
      await evening(db, `post-${format}`, 'published', format);
      return buildDirectVkEveningAnnouncement(db, await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [`post-${format}`]), getPublicAppBaseUrl());
    };
    const club = await post('CASUAL');
    expect(club).toContain('Приходи <друг>! post-CASUAL');
    expect(club).toContain('150 ₽ за игру, не больше 600 ₽ за вечер');
    const novice = await post('NOVICE');
    expect(novice).not.toContain('Приходи <друг>');
    expect(novice).toContain('💳 250 ₽ за игру');
    expect(novice).toContain('👥 Группа для новичков:');
    const rating = await post('RATING');
    expect(rating).not.toContain('Приходи <друг>');
    expect(rating).toContain('💳 Взнос 700 ₽ за вечер — до начала игр');
    // The Telegram post is written by the bot in its own words; the server sends prices, not a ready text.
    const tg = await request(app).get('/api/bot/evenings/post-RATING/telegram-plan').set('X-Bot-Token', 'evening-domain-test');
    expect(tg.status).toBe(200);
    expect(tg.body.evening.announcement_text).toBeUndefined();
    expect(tg.body.evening.price_per_game).toBe(700);
  });

  it('lists old still-open evenings, excludes drafts and settled evenings, and allows active invitations', async () => {
    const { db, app } = await setup();
    const stamp = new Date().toISOString();
    await db.run("INSERT INTO players (id,nickname,game_level,created_at,updated_at) VALUES ('p','Игрок','club',?,?)", [stamp, stamp]);
    for (const [id, status] of [['draft', 'draft'], ['pub', 'published'], ['run', 'active'], ['closed', 'completed'], ['cancel', 'cancelled'], ['settled', 'published']]) await evening(db, id, status);
    await db.run("UPDATE game_evenings SET settled_at=? WHERE id='settled'", [stamp]);
    const response = await request(app).get('/api/player/evenings').set('Cookie', `player_token=${generatePlayerSessionToken('p')}`);
    expect(response.status).toBe(200);
    expect(response.body.evenings.map((row: any) => row.id).sort()).toEqual(['pub', 'run']);
    await db.run("INSERT INTO players (id,nickname,game_level,created_at,updated_at) VALUES ('friend','Друг','club',?,?)", [stamp, stamp]);
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,created_at,updated_at) VALUES ('inviter','run','p','going',?,?)", [stamp, stamp]);
    const contexts = await loadInvitationContextsForRecipients(db, 'p', ['friend']);
    expect(contexts.get('friend')?.evenings.find(row => row.id === 'run')?.state).toBe('eligible');
    expect(isOpenEvening({ status: 'active' })).toBe(true);
    expect(isOpenEvening({ status: 'draft' })).toBe(false);
    expect(isOpenEvening({ status: 'published', settled_at: stamp })).toBe(false);
  });
});
