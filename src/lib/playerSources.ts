const LABELS: Record<string, string> = {
  telegram: 'Telegram', tg: 'Telegram', vk: 'ВКонтакте', vkontakte: 'ВКонтакте',
  referral: 'Приглашение друга', friend: 'Приглашение друга', manual: 'Добавил организатор',
  organizer: 'Добавил организатор', website: 'Сайт', web: 'Сайт', import: 'Импорт',
  legacy: 'Старая база', bot: 'Бот', self: 'Самостоятельная запись',
  __other__: 'Другие источники',
};
export function playerSourceLabel(source: string | null | undefined) {
  const value = String(source || '').trim();
  return LABELS[value.toLowerCase()] || (value ? value[0].toLocaleUpperCase('ru-RU') + value.slice(1) : 'Не указан');
}
