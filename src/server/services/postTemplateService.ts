import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * Texts of posts the organizer can rewrite in the CRM (owner, 2026-10-13: «хочу сам менять текст, а не просить»).
 * The default is the text the code always had; a saved text replaces it, «Вернуть стандартный» deletes the saved one.
 */
export type PostTemplateKey = 'vk_club_evening';

export const POST_TEMPLATE_PLACEHOLDERS: Record<PostTemplateKey, Array<{ token: string; meaning: string; example: string }>> = {
  vk_club_evening: [
    { token: '{когда}', meaning: 'день: «В пятницу, 16 октября»', example: 'В пятницу, 16 октября' },
    { token: '{время}', meaning: 'время начала', example: '21:00' },
    { token: '{место}', meaning: 'площадка', example: 'Суп с Котом' },
    { token: '{где_и_когда}', meaning: 'площадка и время вместе', example: 'Суп с Котом, 21:00' },
    { token: '{цена}', meaning: 'сколько стоит игра и потолок вечера', example: '100 ₽ за игру, не больше 400 ₽ за вечер' },
    { token: '{ссылка}', meaning: 'ссылка на запись на вечер', example: 'https://2la.ru/e/abc' },
    { token: '{название}', meaning: 'название вечера', example: 'Игровой вечер — 16 октября' },
  ],
};

export const DEFAULT_POST_TEMPLATES: Record<PostTemplateKey, string> = {
  vk_club_evening: 'Привет! {когда}, играем в мафию — ждём тебя 🎭\n📍 {где_и_когда} · {цена}\nОтметь, придёшь ли, и выбери игры: {ссылка}',
};

export const POST_TEMPLATE_LABELS: Record<PostTemplateKey, string> = {
  vk_club_evening: 'Пост в ВК: клубный вечер',
};

export const isPostTemplateKey = (value: unknown): value is PostTemplateKey => Object.prototype.hasOwnProperty.call(DEFAULT_POST_TEMPLATES, String(value));

const BODY_MAX = 1500;
let ready = new WeakSet<object>();

async function ensure(db: Pick<DatabaseWrapper, 'run'>) {
  if (ready.has(db as object)) return;
  await db.run('CREATE TABLE IF NOT EXISTS post_text_templates (key TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL)');
  ready.add(db as object);
}
export const resetPostTemplateSchemaForTests = () => { ready = new WeakSet<object>(); };

export class PostTemplateError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

/** The saved text, or the default. */
export async function loadPostTemplate(db: DatabaseWrapper, key: PostTemplateKey): Promise<string> {
  await ensure(db);
  const row = await db.get<{ body: string }>('SELECT body FROM post_text_templates WHERE key = ?', [key]);
  return row?.body?.trim() ? row.body : DEFAULT_POST_TEMPLATES[key];
}

export async function listPostTemplates(db: DatabaseWrapper) {
  await ensure(db);
  const saved = await db.all<{ key: string; body: string; updated_at: string }>('SELECT key, body, updated_at FROM post_text_templates');
  const byKey = new Map(saved.map((row) => [row.key, row]));
  return (Object.keys(DEFAULT_POST_TEMPLATES) as PostTemplateKey[]).map((key) => ({
    key, label: POST_TEMPLATE_LABELS[key], default_body: DEFAULT_POST_TEMPLATES[key],
    body: byKey.get(key)?.body || DEFAULT_POST_TEMPLATES[key], customized: byKey.has(key),
    placeholders: POST_TEMPLATE_PLACEHOLDERS[key], updated_at: byKey.get(key)?.updated_at || null,
  }));
}

export async function savePostTemplate(db: DatabaseWrapper, key: PostTemplateKey, body: unknown) {
  await ensure(db);
  const text = typeof body === 'string' ? body.replace(/\r\n/g, '\n').trim() : '';
  if (!text) throw new PostTemplateError('Напишите текст поста');
  if (text.length > BODY_MAX) throw new PostTemplateError(`Текст: не больше ${BODY_MAX} знаков`);
  // The sign-up link is the point of the post.
  if (key === 'vk_club_evening' && !text.includes('{ссылка}')) throw new PostTemplateError('В тексте должна быть {ссылка} на запись — иначе по посту нельзя записаться');
  await db.run(
    'INSERT INTO post_text_templates (key, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at',
    [key, text, new Date().toISOString()],
  );
}

export async function resetPostTemplate(db: DatabaseWrapper, key: PostTemplateKey) {
  await ensure(db);
  await db.run('DELETE FROM post_text_templates WHERE key = ?', [key]);
}

/**
 * Fills the placeholders; a line left with nothing but punctuation and emoji (the venue or price was empty) is dropped
 * so the post never shows «📍 ,  · ».
 */
export function renderPostTemplate(template: string, values: Record<string, string>): string {
  const fill = (line: string) => line.replace(/\{([^}]+)\}/g, (match, name) => (name in values ? values[name] : match));
  return template.split('\n')
    .map((line) => ({ line, filled: fill(line) }))
    .filter(({ line, filled }) => filled === line || /[\p{L}\p{N}]/u.test(filled))
    .map(({ filled }) => filled)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
