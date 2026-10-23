import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { resetBotFaqSchemaForTests } from '../db/ensureBotFaqSchema.ts';
import { createBotFaq, deleteBotFaq, listBotFaq, moveBotFaq, updateBotFaq } from '../server/services/botFaqService.ts';

let db: DatabaseWrapper;
beforeEach(() => { resetBotFaqSchemaForTests(); db = createDatabaseConnection(':memory:'); });
afterEach(() => { try { db.sqlite.close(); } catch {} });

describe('bot «Частые вопросы» kept in the CRM', () => {
  it('starts with the eight answers the bot always had, switched on', async () => {
    const all = await listBotFaq(db, true);
    expect(all.map((entry) => entry.id)).toEqual(['signup', 'price', 'place', 'novice', 'friend', 'pay', 'tokens', 'cancel']);
    expect(all[1].answer).toContain('в карточке вечера');
    expect(all[1].answer).not.toContain('первые два');
  });

  it('edits an answer, hides a question from the bot and brings it back', async () => {
    await updateBotFaq(db, 'price', { answer: 'Новая цена.' });
    resetBotFaqSchemaForTests();
    expect((await listBotFaq(db, true)).find((entry) => entry.id === 'price')?.answer).toBe('Новая цена.');
    await updateBotFaq(db, 'price', { enabled: false });
    expect((await listBotFaq(db, true)).some((entry) => entry.id === 'price')).toBe(false);
    expect((await listBotFaq(db, false)).some((entry) => entry.id === 'price')).toBe(true);
  });

  it('adds a question at the end, moves it up and deletes it', async () => {
    const created = await createBotFaq(db, { button: '🧩 Своё', title: '🧩 Свой вопрос?', answer: 'Свой ответ.' });
    expect((await listBotFaq(db, false)).at(-1)?.id).toBe(created.id);
    const moved = await moveBotFaq(db, created.id, 'up');
    expect(moved.at(-2)?.id).toBe(created.id);
    await deleteBotFaq(db, created.id);
    await expect(deleteBotFaq(db, created.id)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses empty or too long texts', async () => {
    await expect(createBotFaq(db, { button: '', title: 'a', answer: 'b' })).rejects.toMatchObject({ status: 400 });
    await expect(updateBotFaq(db, 'price', { answer: 'я'.repeat(1501) })).rejects.toMatchObject({ status: 400 });
    await expect(updateBotFaq(db, 'nope', { answer: 'x' })).rejects.toMatchObject({ status: 404 });
  });
});
