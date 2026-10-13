import type { DatabaseWrapper } from './index.ts';

let ready = new WeakSet<object>();

/** The first drafts, written from the list of player-facing changes (owner, 2026-10-13: «хочу сам создавать и заполнять»). */
const FIRST_DRAFTS: Array<{ title: string; body: string }> = [
  { title: 'Покер: чат и эмоции не закрывают стол', body: 'Чат стал компактной панелью над кнопками: стол и ваши карты остаются на виду. На компьютере чат — отдельная колонка справа, а слева видно ход раздачи и стеки.' },
  { title: 'Покер: можно показать карты', body: 'После раздачи покажите всем одну карту или обе. Показанная карта отмечена у игрока на столе.' },
  { title: 'Покер: настоящие звуки и летящие фишки', body: 'Щелчки карт и фишек, стук по столу, фишки летают в банк и к победителю. Звуки включены по умолчанию, выключатель — значок динамика под столом.' },
  { title: 'Спортивная карьера: награды GoMafia', body: 'Кубки и медали за 1–3 места турниров и номинации («Лучший мирный», «Лучший дон», «Лучший шериф», «Лучший чёрный», MVP) появляются в профиле после привязки вашего GoMafia ID.' },
  { title: 'Профиль: статистика по периодам и форматам', body: 'Над цифрами профиля можно выбрать период и формат вечера. Появились вскрытия, круги ухода и рейтинг «По ролям».' },
  { title: 'Страница сыгранной игры стала понятнее', body: 'Сверху итог игры, ниже ваша игра, главное в партии и ход игры.' },
];

/** `whats_new_entries`: the «Что нового» notices the organizer writes in the CRM and players read in the app. */
export async function ensureWhatsNewSchema(db: Pick<DatabaseWrapper, 'run' | 'get'>) {
  if (ready.has(db as object)) return;
  const existed = await db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='whats_new_entries'");
  await db.run(`CREATE TABLE IF NOT EXISTS whats_new_entries (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_whats_new_published ON whats_new_entries(published, published_at)');
  if (!existed) {
    // Drafts only: nothing reaches the players until the owner publishes it.
    const now = new Date();
    for (const [index, draft] of FIRST_DRAFTS.entries()) {
      const stamp = new Date(now.getTime() - index * 1000).toISOString();
      await db.run('INSERT INTO whats_new_entries (id, title, body, published, published_at, created_at, updated_at) VALUES (?, ?, ?, 0, NULL, ?, ?)', [`seed-${index + 1}`, draft.title, draft.body, stamp, stamp]);
    }
  }
  ready.add(db as object);
}

export const resetWhatsNewSchemaForTests = () => { ready = new WeakSet<object>(); };
