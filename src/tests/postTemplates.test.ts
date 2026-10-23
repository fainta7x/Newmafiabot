import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { DEFAULT_POST_TEMPLATES, loadPostTemplate, renderPostTemplate, resetPostTemplate, resetPostTemplateSchemaForTests, savePostTemplate } from '../server/services/postTemplateService.ts';

let db: DatabaseWrapper;
beforeEach(() => { resetPostTemplateSchemaForTests(); db = createDatabaseConnection(':memory:'); });
afterEach(() => { try { db.sqlite.close(); } catch {} });

const values = { 'для_новичков': '', 'подробности_новичкам': '', 'когда': 'В пятницу, 16 октября', 'время': '21:00', 'место': 'Суп с Котом', 'где_и_когда': 'Суп с Котом, 21:00', 'цена': '100 ₽ за игру', 'ссылка': 'https://x/e', 'название': 'Вечер' };

describe('organizer-editable post text', () => {
  it('uses the owner\'s original words until a text is saved', async () => {
    expect(await loadPostTemplate(db, 'vk_club_evening')).toBe(DEFAULT_POST_TEMPLATES.vk_club_evening);
    expect(renderPostTemplate(DEFAULT_POST_TEMPLATES.vk_club_evening, values)).toBe('Привет! В пятницу, 16 октября, играем в мафию — ждём тебя 🎭\n📍 Суп с Котом, 21:00 · 100 ₽ за игру\nОтметь, придёшь ли, и выбери игры: https://x/e');
  });

  it('saves, uses and resets a text; the sign-up link is required', async () => {
    await expect(savePostTemplate(db, 'vk_club_evening', '   ')).rejects.toMatchObject({ status: 400 });
    await expect(savePostTemplate(db, 'vk_club_evening', 'Приходите!')).rejects.toMatchObject({ status: 400 });
    await savePostTemplate(db, 'vk_club_evening', '🔥 {название}\n{когда} в {время}\nЗапись: {ссылка}');
    expect(renderPostTemplate(await loadPostTemplate(db, 'vk_club_evening'), values)).toBe('🔥 Вечер\nВ пятницу, 16 октября в 21:00\nЗапись: https://x/e');
    await resetPostTemplate(db, 'vk_club_evening');
    expect(await loadPostTemplate(db, 'vk_club_evening')).toBe(DEFAULT_POST_TEMPLATES.vk_club_evening);
  });

  it('drops a line left with only punctuation when a value is empty', () => {
    expect(renderPostTemplate('Привет!\n📍 {место}\nЗапись: {ссылка}', { ...values, 'место': '' })).toBe('Привет!\nЗапись: https://x/e');
  });

  it('is available to organizers only', async () => {
    const app = await createApp(db);
    expect((await request(app).get('/api/post-templates')).status).toBe(401);
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const put = await request(app).put('/api/post-templates/vk_club_evening').set('Cookie', cookie).send({ body: 'Играем! {ссылка}' });
    expect(put.status).toBe(200);
    expect(put.body.templates[0]).toMatchObject({ key: 'vk_club_evening', customized: true, body: 'Играем! {ссылка}' });
    expect((await request(app).put('/api/post-templates/unknown').set('Cookie', cookie).send({ body: 'x' })).status).toBe(404);
  });
});
