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
  it('validates organizer settings and freezes prices of existing evenings, including closed ones', async () => {
    const { db, app } = await setup();
    await evening(db, 'old', 'completed', 'CASUAL', '2020-01-01T00:00:00Z');
    const policy = { ...DEFAULT_EVENING_PRICES, casual_game: 150, casual_cap: 600, novice_game: 250, novice_cap: 500, rating_entry: 700 };
    expect((await request(app).put('/api/evening-prices').send(policy)).status).toBe(401);
    expect((await request(app).put('/api/evening-prices').set('Cookie', owner()).send({ ...policy, casual_game: -1 })).status).toBe(400);
    expect((await request(app).put('/api/evening-prices').set('Cookie', owner()).send(policy)).status).toBe(200);
    await evening(db, 'new', 'published', 'CASUAL', '2099-01-01T00:00:00Z');
    expect(await loadEveningPrices(db, 'old')).toEqual(DEFAULT_EVENING_PRICES);
    expect(await loadEveningPrices(db, 'new')).toEqual(policy);
    const plan = await ensureSlotsForEvening(db, 'new');
    expect(plan.settings.price_per_game).toBe(150);
    expect(plan.slots.every((slot: any) => slot.price_rub === 150)).toBe(true);
    expect(eveningSelectionPrice('CASUAL', [150, 150, 150, 150, 150], policy)).toBe(600);
    expect(eveningSelectionPrice('NOVICE', [250, 250, 250], policy)).toBe(500);
    await savePriceSettings(db, { ...policy, casual_game: 300 });
    expect(await loadEveningPrices(db, 'new')).toEqual(policy);
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

  it.each(['CASUAL', 'NOVICE', 'RATING'])('uses the very same saved announcement in Telegram and VK for %s', async (format) => {
    const { db, app } = await setup();
    vi.stubEnv('BOT_API_SECRET', 'evening-domain-test');
    await evening(db, 'post', 'published', format);
    await savePostTemplate(db, 'vk_club_evening', 'Приходи <друг>! {название}\n{цена}\n{ссылка}');
    const row = await db.get<any>("SELECT * FROM game_evenings WHERE id='post'");
    const tg = await request(app).get('/api/bot/evenings/post/telegram-plan').set('X-Bot-Token', 'evening-domain-test');
    expect(tg.status).toBe(200);
    const vk = await buildDirectVkEveningAnnouncement(db, row, getPublicAppBaseUrl());
    expect(tg.body.evening.announcement_text).toBe(vk);
    expect(vk).toContain('Приходи <друг>! post');
    expect(vk).toContain(format === 'NOVICE' ? '200 ₽ за игру' : format === 'RATING' ? '500 ₽ за вечер' : '100 ₽ за игру, не больше 400 ₽ за вечер');
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
