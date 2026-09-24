export const EVENING_FORMATS = ['NOVICE', 'CASUAL', 'RATING', 'TOURNAMENT'] as const;
export type EveningFormat = (typeof EVENING_FORMATS)[number];

// STANDARD is the pre-cutover value. Keep accepting/reading it so existing evenings
// remain valid; semantically it is the old regular club evening, i.e. CASUAL.
export type StoredEveningFormat = EveningFormat | 'STANDARD';

export const normalizeEveningFormat = (value: unknown): EveningFormat => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'NOVICE') return 'NOVICE';
  if (normalized === 'RATING') return 'RATING';
  if (normalized === 'TOURNAMENT') return 'TOURNAMENT';
  return 'CASUAL';
};

export const EVENING_FORMAT_LABELS: Record<EveningFormat, string> = {
  NOVICE: 'Для новичков',
  CASUAL: 'Клубный',
  RATING: 'Рейтинговый',
  TOURNAMENT: 'Турнир',
};

/**
 * Product meaning of each club-evening format.
 * CASUAL intentionally keeps Elo: it is a relaxed club night, not an unranked mode.
 * RATING and TOURNAMENT are the explicitly competitive formats.
 */
/** Novice evening schedule (BUSINESS_RULES): briefing 30 min before the first game, CASUAL continues from 21:00. */
export const NOVICE_BRIEFING_LEAD_MINUTES = 30;
export const NOVICE_FIRST_GAME_TIME = '19:00';

const moscowClock = (value: number) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** «Брифинг для новичков — 18:30, первая игра — 19:00» for a novice evening's first game time. */
export const noviceScheduleLine = (firstGameAt: string | null | undefined): string | null => {
  const time = new Date(String(firstGameAt || '')).getTime();
  if (!Number.isFinite(time)) return null;
  return `Брифинг для новичков — ${moscowClock(time - NOVICE_BRIEFING_LEAD_MINUTES * 60000)}, первая игра — ${moscowClock(time)}`;
};

// Novice evenings default to the first game at 19:00 (briefing 18:30); keep a chosen date, else take the coming Friday.
export const noviceStartsAt = (current: string, today = new Date()): string => {
  if (/^\d{4}-\d{2}-\d{2}/.test(current)) return `${current.slice(0, 10)}T${NOVICE_FIRST_GAME_TIME}`;
  const moscowToday = new Date(`${today.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })}T12:00:00Z`);
  moscowToday.setUTCDate(moscowToday.getUTCDate() + ((5 - moscowToday.getUTCDay() + 7) % 7));
  return `${moscowToday.toISOString().slice(0, 10)}T${NOVICE_FIRST_GAME_TIME}`;
};

export const EVENING_FORMAT_DESCRIPTIONS: Record<EveningFormat, string> = {
  NOVICE: 'Школа мафии: брифинг за 30 минут до первой игры (обычно 18:30, игры с 19:00). Первые два посещения бесплатно, дальше 200 ₽ за игру. Elo не меняется.',
  CASUAL: 'Обычный клубный вечер. Elo считается, но без акцента на жёсткий рейтинг.',
  RATING: 'Рейтинговые игры с баллами сезона. Записаться могут только турнирные игроки. Elo считается.',
  TOURNAMENT: 'Турнирный формат с максимальным спортивным акцентом. Elo считается.',
};

export const eveningFormatAffectsElo = (value: unknown): boolean => {
  switch (normalizeEveningFormat(value)) {
    case 'NOVICE':
      return false;
    case 'CASUAL':
    case 'RATING':
    case 'TOURNAMENT':
      return true;
  }
};

export const eveningFormatIsCompetitive = (value: unknown): boolean => {
  const format = normalizeEveningFormat(value);
  return format === 'RATING' || format === 'TOURNAMENT';
};
