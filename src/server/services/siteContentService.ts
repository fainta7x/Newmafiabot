import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * Texts of the club's public site that the organizer edits in the CRM («Ещё → Сайт»; owner, 2026-11-12: «CMS, чтобы править самому»).
 * They are saved in the same table as the post texts (`post_text_templates`) under the `site.` prefix; a missing text means the default,
 * which is what the site shows when the app does not answer.
 */
export const SITE_BLOCKS = [
  { key: 'hero_lead', label: 'Обложка: подзаголовок', hint: 'Первое, что видит человек под заголовком «Спортивная мафия в Туле».', multiline: true,
    default: 'Любишь азарт соревнований, сложные стратегии и интеллектуальные вызовы? Тогда тебе к нам! Играем в кафе «Суп с котом».' },
  { key: 'schedule_line', label: 'Обложка: когда играем', hint: 'Одна строка под кнопкой «Занять место».', multiline: false,
    default: 'Каждую пятницу с 18:30 до 21:00 · первые 2 вечера бесплатно · новичкам всё объясним' },
  { key: 'about', label: 'Что это за игра', hint: 'Абзац про спортивную мафию.', multiline: true,
    default: 'Спортивная мафия — интеллектуальная соревновательная дисциплина: командное противостояние и личное мастерство. Здесь решают логика, стратегия, аргументы и умение разбираться в соперниках. По ней проводятся турниры и чемпионаты.' },
  { key: 'newcomers', label: 'Новичкам', hint: 'Абзац под заголовком «Опыт не нужен».', multiline: true,
    default: 'Объясним правила, познакомим с основами игры и поможем сыграть первые партии.' },
  { key: 'benefits', label: 'Что даёт спортивная мафия', hint: 'Карточки на сайте: заголовок в первой строке, текст ниже. Между карточками — пустая строка. Можно добавлять и удалять.', multiline: true,
    default: 'Новый вид спорта\nПопробуй себя в официальном интеллектуальном спорте: у спортивной мафии есть правила, судьи и турниры.\n\nТурниры и поездки\nИграй на турнирах с игроками из разных городов и стран. Поездки и путешествия вместе с командой.\n\nПризы и награды\nЗа победы в турнирах выдают денежные призы и награды.\n\nЖивое сообщество\nВ клубе всегда что-то происходит: игры, встречи, внутренние движухи.\n\nОнлайн-игры\nИграй онлайн, когда не получается прийти в клуб.\n\nПрокачка навыков\nТренируешь речь, мышление, стратегию и тактику. Учишься понимать людей и их психологию.' },
  { key: 'audience', label: 'Кому к нам', hint: 'Для кого клуб.', multiline: true,
    default: 'Любителям Dota 2, CS2 и других соревновательных игр. Поклонникам шахмат, стратегий и сложных настолок. Любителям покера, блефа и психологических игр. Всем, кто хочет побеждать и расти.' },
  { key: 'rating', label: 'Рейтинг', hint: 'Абзац над таблицей лучших.', multiline: true,
    default: 'Рейтинг строится по играм клуба. Играй, и твой ник поднимется в таблице.' },
  { key: 'place', label: 'Где играем', hint: 'Адрес и время под названием кафе.', multiline: true,
    default: 'Тула, Пушкинский проезд, 4А. Каждую пятницу с 18:30 до 21:00.' },
  { key: 'faq', label: 'Вопросы и ответы', hint: 'Вопрос в первой строке, ответ ниже. Между вопросами — пустая строка. Можно добавлять и удалять.', multiline: true,
    default: 'Можно прийти без опыта?\nДа. Объясним правила до игры и поможем разобраться после.\n\nКогда и где проходят игры?\nПо пятницам с 18:30 до 21:00 в кафе «Суп с котом» в Туле. Первые 2 вечера бесплатные. Точные детали пришлём после записи.\n\nКак записаться?\nВыбери пятницу в блоке записи выше и оставь контакт. Мы напишем и подтвердим место.' },
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
