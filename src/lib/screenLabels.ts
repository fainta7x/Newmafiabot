/** Plain names of app screens, keyed by the path with ids replaced by `:id` (uiUsageNames.ts). */
export const SCREEN_LABELS: Record<string, string> = {
  '/player': 'Главная',
  '/player/events': 'События',
  '/player/events/:id': 'Карточка события',
  '/player/games': 'Игры',
  '/player/rating': 'Рейтинг · Elo',
  '/player/rating/periods': 'Рейтинг · Сезон',
  '/player/rating/tournaments': 'Рейтинг · Турниры',
  '/player/club': 'Клуб',
  '/player/profile': 'Профиль',
  '/player/wallet': 'Жетоны',
  '/player/payments': 'Оплаты',
  '/player/conduct': 'Ведение игры',
  '/player/conduct/music': 'Музыка ведущего',
  '/admin': 'Сегодня',
  '/admin/evenings': 'События',
  '/admin/evenings/:id': 'Вечер · Анонс',
  '/admin/evenings/:id/participants': 'Вечер · Ответы',
  '/admin/evenings/:id/management': 'Вечер · Вечер',
  '/admin/evenings/:id/games': 'Вечер · Игры',
  '/admin/players': 'Игроки',
  '/admin/more': 'Ещё',
  '/admin/tasks': 'Дела',
  '/admin/analytics': 'Аналитика',
};

export const screenLabel = (path: string) => SCREEN_LABELS[path] || path;

/** Plain names of the buttons the app reports (`data-track` / `data-testid`, ids replaced by `:id`). */
const NAV_LABELS: Record<string, string> = { home: 'Главная', events: 'События', games: 'Игры', rating: 'Рейтинг', club: 'Клуб', profile: 'Профиль' };
const ACTION_LABELS: Record<string, string> = {
  'player-quick-profile': 'Кнопка «Профиль»',
  'player-quick-wallet': 'Кнопка жетонов',
  'crm-today-evening-card': 'Карточка вечера на «Сегодня»',
};

const PROFILE_TAB_LABELS: Record<string, string> = { overview: 'Обзор', games: 'Игры', roles: 'Роли', elo: 'Elo', awards: 'Награды', history: 'История клуба', connections: 'Связи' };

export const actionLabel = (name: string) => {
  if (ACTION_LABELS[name]) return ACTION_LABELS[name];
  const nav = name.match(/^player-nav-(.+)$/);
  if (nav) return `Меню · ${NAV_LABELS[nav[1]] || nav[1]}`;
  const tab = name.match(/^profile-tab-(.+)$/);
  if (tab) return `Профиль · вкладка «${PROFILE_TAB_LABELS[tab[1]] || tab[1]}»`;
  return name;
};
