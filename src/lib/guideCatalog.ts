/**
 * «Школа мафии» catalog: everything the /guide page shows, in one place.
 *
 * How to add something:
 * - a lesson: append to GUIDE_LESSONS (content: scenario steps, roles or text blocks);
 * - an article: add an entry with view 'article' and its blocks to GUIDE_ENTRIES (shelf 'articles');
 * - a trainer or a new reference screen: add an entry with a new `view`, then map that view to a
 *   component in GUIDE_VIEWS (src/components/public/PublicGuide.tsx).
 * The home screen, the addresses (/guide?tab=<id>) and the back navigation pick entries up automatically.
 * Texts about the game come only from the organizer's explanations (see docs/BUSINESS_RULES.md).
 */
import { GLOSSARY, ROLES, SCENARIO, SIMPLE_RULES, type GuideBlock } from './clubGuide.ts';
import { GUIDE_QUIZ } from './clubGuideQuiz.ts';

/** «1 часть», «3 части», «6 частей». */
export const pluralRu = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export type GuideShelfId = 'reference' | 'articles' | 'trainers';
export type GuideIcon = 'moon' | 'users' | 'scale' | 'book' | 'vote' | 'article' | 'list';
export type GuideView = 'evening' | 'roles' | 'rules' | 'glossary' | 'quiz' | 'split' | 'split-three' | 'article';

export type GuideEntry = {
  /** Stable address: /guide?tab=<id>. Never rename a published id — people share links. */
  id: string;
  shelf: GuideShelfId;
  view: GuideView;
  title: string;
  /** One line under the title on the home screen. */
  detail: string;
  icon: GuideIcon;
  /** Content for view 'article'. */
  blocks?: GuideBlock[];
};

export type GuideShelf = { id: GuideShelfId; title: string; layout: 'tiles' | 'rows' };

/** Home screen order. A shelf without entries is not shown. */
export const GUIDE_SHELVES: GuideShelf[] = [
  { id: 'reference', title: 'Справочник', layout: 'tiles' },
  { id: 'articles', title: 'Статьи', layout: 'rows' },
  { id: 'trainers', title: 'Тренажёры', layout: 'rows' },
];

const blocksOfGroup = (group: string) => SIMPLE_RULES.filter((block) => block.group === group);
const blocksTitled = (...titles: string[]) => SIMPLE_RULES.filter((block) => titles.includes(block.title));

export const GUIDE_ENTRIES: GuideEntry[] = [
  { id: 'evening', shelf: 'reference', view: 'evening', icon: 'moon', title: 'Как пройдёт вечер', detail: `${SCENARIO.length} шагов от записи до финала` },
  { id: 'roles', shelf: 'reference', view: 'roles', icon: 'users', title: 'Роли', detail: ROLES.map((role) => role.name.split(' ')[0]).join(', ') },
  { id: 'rules', shelf: 'reference', view: 'rules', icon: 'scale', title: 'Правила', detail: 'Простыми словами и подробно' },
  { id: 'glossary', shelf: 'reference', view: 'glossary', icon: 'book', title: 'Словарь', detail: `${GLOSSARY.length} слов клуба` },
  { id: 'split-article', shelf: 'articles', view: 'article', icon: 'article', title: 'Попил в первый день', detail: 'Зачем город никого не заголосовывает в первый день', blocks: blocksOfGroup('Попил в первый день') },
  { id: 'agreement', shelf: 'articles', view: 'article', icon: 'article', title: 'Договорка', detail: 'Как мафия решает, кого убивать', blocks: blocksTitled('Договорка — как мафия решает, кого убивать') },
  { id: 'split', shelf: 'trainers', view: 'split', icon: 'vote', title: 'Попил в нулевом круге', detail: 'За столом 10 · уровни и экзамены' },
  { id: 'split-three', shelf: 'trainers', view: 'split-three', icon: 'vote', title: 'Попил на троих', detail: 'За столом 9 · лёгкий уровень' },
  { id: 'quiz', shelf: 'trainers', view: 'quiz', icon: 'list', title: 'Проверь себя', detail: `${GUIDE_QUIZ.length} ${pluralRu(GUIDE_QUIZ.length, 'короткий вопрос', 'коротких вопроса', 'коротких вопросов')}. Ни на что не влияет` },
];

export type GuideLessonContent =
  | { kind: 'scenario'; start: number; end: number }
  | { kind: 'roles' }
  | { kind: 'blocks'; blocks: GuideBlock[] };

export type GuideLesson = { id: string; title: string; description: string; content: GuideLessonContent };

/** «Путь новичка»: read in order, progress is remembered in the browser by lesson id. */
export const GUIDE_LESSONS: GuideLesson[] = [
  { id: 'first-evening', title: 'Первый вечер', description: 'Как записаться, прийти и сесть за стол.', content: { kind: 'scenario', start: 0, end: 3 } },
  { id: 'roles', title: 'Кто за столом', description: 'Цели мирного, Шерифа, мафии и Дона.', content: { kind: 'roles' } },
  { id: 'day-night', title: 'День и ночь', description: 'Речь, голосование, ночная игра и победа.', content: { kind: 'scenario', start: 3, end: SCENARIO.length } },
  { id: 'table-rules', title: 'Правила за столом', description: 'Как играть спокойно и не получить замечание.', content: { kind: 'blocks', blocks: blocksTitled('Как тут наказывают', '⛔ Чего делать нельзя', 'Как не получить замечание') } },
];

/** Screens that are not catalog entries. */
export const GUIDE_FIXED_SCREENS = ['home', 'lessons'] as const;

export const findGuideEntry = (id: string) => GUIDE_ENTRIES.find((entry) => entry.id === id) || null;

export const isGuideScreen = (id: string | null | undefined): id is string =>
  Boolean(id) && ((GUIDE_FIXED_SCREENS as readonly string[]).includes(id!) || Boolean(findGuideEntry(id!)));
