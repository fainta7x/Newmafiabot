import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * Texts of the club's public site that the organizer edits in the CRM («Ещё → Сайт»; owner, 2026-11-12: «CMS, чтобы править самому»).
 * They are saved in the same table as the post texts (`post_text_templates`) under the `site.` prefix; a missing text means the default,
 * which is what the site shows when the app does not answer.
 */
export const SITE_BLOCKS = [
  { key: 'hero_lead', label: 'Обложка: подзаголовок', hint: 'Первое, что видит человек под заголовком «Спортивная мафия в Туле».', multiline: true,
    default: 'Приходи поиграть с нами. Каждую пятницу мы объясняем правила с нуля и играем вместе. Опыт не нужен.' },
  { key: 'schedule_line', label: 'Обложка: когда играем', hint: 'Одна строка под кнопкой «Занять место».', multiline: false,
    default: 'Пятница, 18:30' },
  { key: 'about', label: 'Что это за игра', hint: 'Абзац про спортивную мафию.', multiline: true,
    default: 'Мы играем в мафию по-взрослому: с правилами, судьями и настоящими турнирами. За столом десять человек. Кто-то честно ищет мафию, кто-то делает вид, что он свой. Здесь никто не угадывает: каждый слушает, сомневается и доказывает.' },
  { key: 'newcomers', label: 'Новичкам', hint: 'Абзац под заголовком «Опыт не нужен».', multiline: true,
    default: 'Все с чего-то начинали. Мы объясним правила до игры и сядем играть вместе, ты не останешься один.' },
  { key: 'benefits', label: 'Что даёт спортивная мафия', hint: 'Карточки на сайте: заголовок в первой строке, текст ниже. Между карточками — пустая строка. Можно добавлять и удалять.', multiline: true,
    default: 'Это настоящий спорт\nУ спортивной мафии есть правила, судьи и турниры. Можно начать с обычной пятницы, а дойти до турнира.\n\nПоездки и новые люди\nНа турнирах играешь с людьми из других городов и стран. Мы ездим туда командой.\n\nМожно выиграть призы\nЗа победы на турнирах дают денежные призы и награды.\n\nУ нас своя компания\nМы не только играем по пятницам: встречаемся, придумываем клубные события, знакомимся.\n\nИграть можно и онлайн\nНе получилось прийти? Сыграем онлайн.\n\nСтанешь увереннее\nНаучишься коротко и убедительно говорить, быстро думать и понимать людей. Это пригодится не только за столом.' },
  { key: 'audience', label: 'Кому у нас понравится', hint: 'Четыре короткие карточки: заголовок в первой строке, текст ниже, между карточками пустая строка.', multiline: true,
    default: 'Если играешь в Dota 2 или CS2\nЗдесь тот же азарт, только вся команда сидит за одним столом.\n\nЕсли любишь шахматы и стратегии\nЗдесь тоже побеждает тот, кто лучше считает и планирует.\n\nЕсли нравится покер\nБлеф и умение читать людей решают почти всё.\n\nЕсли просто хочешь попробовать\nПриходи в пятницу. Остальное объясним на месте.' },
  { key: 'rating', label: 'Рейтинг', hint: 'Абзац над таблицей лучших.', multiline: true,
    default: 'Все игры клуба идут в рейтинг. Чем чаще играешь, тем выше твой ник.' },
  { key: 'place', label: 'Где играем', hint: 'Адрес и время под названием кафе.', multiline: true,
    default: 'Мы играем в кафе «Суп с котом», Пушкинский проезд, 4А. Приходи в пятницу к 18:30.' },
  { key: 'faq', label: 'Вопросы и ответы', hint: 'Вопрос в первой строке, ответ ниже. Между вопросами — пустая строка. Можно добавлять и удалять.', multiline: true,
    default: 'Я никогда не играл. Можно прийти?\nКонечно. Объясним правила до игры и сядем играть вместе. Приходи один или с другом.\n\nКогда и где мы играем?\nПо пятницам в кафе «Суп с котом» на Пушкинском проезде. Собираемся в 18:30, играем до 21:00.\n\nСколько это стоит?\nПервые два вечера бесплатно.\n\nКак записаться?\nВыбери пятницу выше, оставь имя и контакт. Мы закрепим за тобой место и напишем.' },
  { key: 'telegram_url', label: 'Ссылка на Telegram клуба', hint: 'Адрес вида https://t.me/…', multiline: false, default: 'https://t.me/mafiatulasport' },
  { key: 'vk_url', label: 'Ссылка на группу ВКонтакте', hint: 'Адрес вида https://vk.com/…', multiline: false, default: 'https://vk.com/2lanoiremafia' },
] as const;

export type SiteBlockKey = (typeof SITE_BLOCKS)[number]['key'];
const PREFIX = 'site.';
const BODY_MAX = 2000;
const LINK_KEYS = new Set<string>(['telegram_url', 'vk_url']);
let ready = new WeakSet<object>();

async function ensure(db: Pick<DatabaseWrapper, 'run'>) {
  if (ready.has(db as object)) return;
  await db.run('CREATE TABLE IF NOT EXISTS post_text_templates (key TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL)');
  ready.add(db as object);
}
export const resetSiteContentSchemaForTests = () => { ready = new WeakSet<object>(); };

export class SiteContentError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export const isSiteBlockKey = (value: unknown): value is SiteBlockKey => SITE_BLOCKS.some((block) => block.key === value);

export async function listSiteBlocks(db: DatabaseWrapper) {
  await ensure(db);
  const saved = await db.all<{ key: string; body: string; updated_at: string }>('SELECT key, body, updated_at FROM post_text_templates WHERE key LIKE ?', [`${PREFIX}%`]);
  const byKey = new Map(saved.map((row) => [row.key.slice(PREFIX.length), row]));
  return SITE_BLOCKS.map((block) => {
    const row = byKey.get(block.key);
    const body = row?.body?.trim() ? row.body : block.default;
    return { key: block.key, label: block.label, hint: block.hint, multiline: block.multiline, default_body: block.default, body, customized: Boolean(row?.body?.trim()), updated_at: row?.updated_at || null };
  });
}

/** key → text, for the public page. */
export async function loadSiteTexts(db: DatabaseWrapper): Promise<Record<string, string>> {
  return Object.fromEntries((await listSiteBlocks(db)).map((block) => [block.key, block.body]));
}

export async function saveSiteBlock(db: DatabaseWrapper, key: SiteBlockKey, body: unknown) {
  await ensure(db);
  const text = typeof body === 'string' ? body.replace(/\r\n/g, '\n').trim() : '';
  if (!text) throw new SiteContentError('Напишите текст');
  if (text.length > BODY_MAX) throw new SiteContentError(`Текст: не больше ${BODY_MAX} знаков`);
  if (LINK_KEYS.has(key) && !/^https:\/\/[^\s]+$/i.test(text)) throw new SiteContentError('Ссылка должна начинаться с https://');
  await db.run(
    'INSERT INTO post_text_templates (key, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at',
    [`${PREFIX}${key}`, text, new Date().toISOString()],
  );
}

export async function resetSiteBlock(db: DatabaseWrapper, key: SiteBlockKey) {
  await ensure(db);
  await db.run('DELETE FROM post_text_templates WHERE key = ?', [`${PREFIX}${key}`]);
}
