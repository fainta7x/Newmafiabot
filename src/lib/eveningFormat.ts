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
  CASUAL: 'Для отдыха',
  RATING: 'Рейтинговый',
  TOURNAMENT: 'Турнир',
};

/**
 * Product meaning of each club-evening format.
 * CASUAL intentionally keeps Elo: it is a relaxed club night, not an unranked mode.
 * RATING and TOURNAMENT are the explicitly competitive formats.
 */
export const EVENING_FORMAT_DESCRIPTIONS: Record<EveningFormat, string> = {
  NOVICE: 'Обучающий формат. Elo не меняется.',
  CASUAL: 'Обычный клубный вечер. Elo считается, но без акцента на жёсткий рейтинг.',
  RATING: 'Спортивный рейтинговый вечер. Elo считается.',
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
