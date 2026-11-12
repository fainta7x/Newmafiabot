import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * Texts of the club's public site that the organizer edits in the CRM («Ещё → Сайт»; owner, 2026-11-12: «CMS, чтобы править самому»).
 * They are saved in the same table as the post texts (`post_text_templates`) under the `site.` prefix; a missing text means the default,
 * which is what the site shows when the app does not answer.
 */
export const SITE_BLOCKS = [
  { key: 'hero_lead', label: 'Обложка: подзаголовок', hint: 'Первое, что видит человек под заголовком «Спортивная мафия в Туле».', multiline: true,
    default: 'Игры каждую пятницу. Опыт не нужен: правила объясним на месте.' },
  { key: 'schedule_line', label: 'Обложка: когда играем', hint: 'Одна строка под кнопкой «Занять место».', multiline: false,
    default: 'Пятница, 18:30' },
  { key: 'about', label: 'Что это за игра', hint: 'Абзац про спортивную мафию.', multiline: true,
    default: 'Спортивная мафия — командная игра на десять человек: семь мирных жителей против трёх игроков мафии. Днём игроки обсуждают и голосуют, ночью мафия выбирает, кого убрать. У каждого есть минута на речь. Игра идёт по единым правилам, по ним проводят турниры и чемпионаты.' },
  { key: 'newcomers', label: 'Как проходит вечер: подпись', hint: 'Одно предложение над расписанием вечера.', multiline: true,
    default: 'Первый раз у нас можно прийти без опыта и без компании. Вот как проходит пятница.' },
  { key: 'benefits', label: 'Что даёт спортивная мафия', hint: 'Карточки на сайте: заголовок в первой строке, текст ниже. Между карточками — пустая строка. Можно добавлять и удалять.', multiline: true,
    default: 'Официальный вид интеллектуального спорта\nУ спортивной мафии единые правила, судьи и турниры.\n\nТурниры и поездки\nИграй с людьми из разных городов и стран, езди на турниры.\n\nПризы и награды\nЗа победы на турнирах выдают денежные призы и награды.\n\nСообщество\nПостоянные активности клуба: игры, встречи, события.\n\nОнлайн-игры\nМожно играть онлайн.\n\nРазвитие навыков\nТренируешь речь, мышление, стратегию, тактику и понимание людей.' },
  { key: 'rules', label: 'Правила для новичков', hint: 'Коротко, как играют: роли и кто побеждает.', multiline: true,
    default: 'Мирные жители ищут мафию. Шериф каждую ночь проверяет одного игрока и узнаёт, мирный он или мафия. Мафия ночью выбирает, кого убрать, а днём делает вид, что она мирная. Мирные побеждают, когда находят всех мафиози. Мафия побеждает, когда её остаётся столько же, сколько мирных. Если не запомнишь всё сразу, ничего страшного: ведущий объяснит перед игрой.' },
  { key: 'evening', label: 'Как проходит вечер', hint: 'Время в первой строке карточки, что происходит ниже. Между карточками пустая строка.', multiline: true,
    default: '18:30\nСобираемся, знакомимся и объясняем правила.\n\n19:00\nПервая игра.\n\n20:00\nВторая игра.\n\n21:00\nЗаканчиваем.' },
  { key: 'audience', label: 'Кому подойдёт', hint: 'Каждая строка — одна карточка.', multiline: true,
    default: 'Любителям Dota 2, CS2 и других соревновательных игр\nЛюбителям шахмат, стратегий и сложных настолок\nЛюбителям покера, блефа и психологических игр\nВсем, кто любит соревноваться, побеждать и совершенствовать навыки' },
  { key: 'rating', label: 'Рейтинг', hint: 'Абзац над таблицей лучших.', multiline: true,
    default: 'Рейтинг считается по играм клуба.' },
  { key: 'place', label: 'Где играем', hint: 'Адрес и время под названием кафе.', multiline: true,
    default: 'Кафе «Суп с котом», Пушкинский проезд, 4А. Игры по пятницам с 18:30 до 21:00.' },
  { key: 'faq', label: 'Вопросы и ответы', hint: 'Вопрос в первой строке, ответ ниже. Между вопросами — пустая строка. Можно добавлять и удалять.', multiline: true,
    default: 'Нужен ли опыт?\nНет. Правила объясним перед игрой.\n\nКогда и где проходят игры?\nПо пятницам с 18:30 до 21:00 в кафе «Суп с котом», Пушкинский проезд, 4А.\n\nСколько это стоит?\nПервые два вечера бесплатно.\n\nКак записаться?\nВыбери пятницу в блоке записи, оставь имя и контакт. Место закрепится за тобой, мы напишем и подтвердим.' },
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
