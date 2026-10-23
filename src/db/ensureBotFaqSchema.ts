import type { DatabaseWrapper } from './index.ts';
import { BOT_FAQ_SEED } from './botFaqSeed.ts';

let ready = new WeakSet<object>();

/** `bot_faq_entries`: the bot's «Частые вопросы». Seeded once from the former in-code list; then the organizer edits them in the CRM. */
export async function ensureBotFaqSchema(db: Pick<DatabaseWrapper, 'run' | 'get'>) {
  if (ready.has(db as object)) return;
  const existed = await db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='bot_faq_entries'");
  await db.run(`CREATE TABLE IF NOT EXISTS bot_faq_entries (
    id TEXT PRIMARY KEY,
    button TEXT NOT NULL,
    title TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )`);
  if (!existed) {
    const now = new Date().toISOString();
    for (const [index, item] of BOT_FAQ_SEED.entries()) {
      await db.run('INSERT INTO bot_faq_entries (id, button, title, answer, position, enabled, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)', [item.id, item.button, item.title, item.answer, index, now]);
    }
  }
  // Replace only untouched legacy defaults; preserve every organizer-edited FAQ.
  for (const old of [
    { id: "price", answer: "На клубном вечере одна игра стоит 100 ₽, но за весь вечер ты заплатишь не больше 400 ₽ — сколько бы ни сыграл.\n\nЕсли ты новичок, первые два вечера для тебя бесплатные 🎁 Дальше — 200 ₽ за игру.\n\nСчитать самому ничего не нужно: приложение всё посчитает за тебя." },
    { id: "friend", answer: "Конечно, с другом даже веселее! Попроси его тоже записаться через бота — так мы будем знать, сколько столов подготовить.\n\nЕсли он новичок, его первые два вечера бесплатные 🎁" },
  ]) {
    const replacement = BOT_FAQ_SEED.find(item => item.id === old.id);
    if (replacement) await db.run('UPDATE bot_faq_entries SET answer = ?, updated_at = ? WHERE id = ? AND answer = ?', [replacement.answer, new Date().toISOString(), old.id, old.answer]);
  }
  ready.add(db as object);
}

export const resetBotFaqSchemaForTests = () => { ready = new WeakSet<object>(); };
