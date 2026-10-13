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
  ready.add(db as object);
}

export const resetBotFaqSchemaForTests = () => { ready = new WeakSet<object>(); };
