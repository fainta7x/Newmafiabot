import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureBotFaqSchema } from '../../db/ensureBotFaqSchema.ts';

export type BotFaqEntry = { id: string; button: string; title: string; answer: string; position: number; enabled: boolean };
export class BotFaqError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

const BUTTON_MAX = 32;
const TITLE_MAX = 80;
const ANSWER_MAX = 1500;

const toEntry = (row: any): BotFaqEntry => ({
  id: String(row.id), button: String(row.button), title: String(row.title), answer: String(row.answer || ''),
  position: Number(row.position) || 0, enabled: Number(row.enabled) === 1,
});

/** What the bot shows: switched-on questions in the organizer's order. */
export async function listBotFaq(db: DatabaseWrapper, onlyEnabled: boolean): Promise<BotFaqEntry[]> {
  await ensureBotFaqSchema(db);
  const rows = await db.all<any>(`SELECT * FROM bot_faq_entries ${onlyEnabled ? 'WHERE enabled = 1' : ''} ORDER BY position ASC, updated_at ASC LIMIT 100`);
  return rows.map(toEntry);
}

const clean = (input: { button?: unknown; title?: unknown; answer?: unknown }, requireAll: boolean) => {
  const pick = (value: unknown, label: string, max: number) => {
    if (value === undefined) { if (requireAll) throw new BotFaqError(`Заполните: ${label}`); return undefined; }
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new BotFaqError(`Заполните: ${label}`);
    if (text.length > max) throw new BotFaqError(`Слишком длинно (${label}): не больше ${max} знаков`);
    return text;
  };
  return {
    button: pick(input.button, 'кнопка', BUTTON_MAX),
    title: pick(input.title, 'вопрос', TITLE_MAX),
    answer: pick(input.answer, 'ответ', ANSWER_MAX),
  };
};

export async function createBotFaq(db: DatabaseWrapper, input: { button?: unknown; title?: unknown; answer?: unknown }): Promise<BotFaqEntry> {
  await ensureBotFaqSchema(db);
  const { button, title, answer } = clean(input, true);
  const last = await db.get<{ top: number | null }>('SELECT MAX(position) AS top FROM bot_faq_entries');
  const id = randomUUID();
  await db.run('INSERT INTO bot_faq_entries (id, button, title, answer, position, enabled, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)', [id, button, title, answer, (Number(last?.top) || 0) + 1, new Date().toISOString()]);
  return toEntry(await db.get<any>('SELECT * FROM bot_faq_entries WHERE id = ?', [id]));
}

export async function updateBotFaq(db: DatabaseWrapper, id: string, input: { button?: unknown; title?: unknown; answer?: unknown; enabled?: unknown }): Promise<BotFaqEntry> {
  await ensureBotFaqSchema(db);
  const current = await db.get<any>('SELECT * FROM bot_faq_entries WHERE id = ?', [id]);
  if (!current) throw new BotFaqError('Вопрос не найден', 404);
  const { button, title, answer } = clean(input, false);
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : Number(current.enabled) === 1;
  await db.run('UPDATE bot_faq_entries SET button = ?, title = ?, answer = ?, enabled = ?, updated_at = ? WHERE id = ?',
    [button ?? current.button, title ?? current.title, answer ?? current.answer, enabled ? 1 : 0, new Date().toISOString(), id]);
  return toEntry(await db.get<any>('SELECT * FROM bot_faq_entries WHERE id = ?', [id]));
}

/** Moves one question a step up or down in the bot's list. */
export async function moveBotFaq(db: DatabaseWrapper, id: string, direction: 'up' | 'down'): Promise<BotFaqEntry[]> {
  const all = await listBotFaq(db, false);
  const index = all.findIndex((entry) => entry.id === id);
  if (index < 0) throw new BotFaqError('Вопрос не найден', 404);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target >= 0 && target < all.length) {
    [all[index], all[target]] = [all[target], all[index]];
    for (const [position, entry] of all.entries()) await db.run('UPDATE bot_faq_entries SET position = ? WHERE id = ?', [position, entry.id]);
  }
  return listBotFaq(db, false);
}

export async function deleteBotFaq(db: DatabaseWrapper, id: string): Promise<void> {
  await ensureBotFaqSchema(db);
  const result = await db.run('DELETE FROM bot_faq_entries WHERE id = ?', [id]);
  if (!(result as any)?.changes) throw new BotFaqError('Вопрос не найден', 404);
}
