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
