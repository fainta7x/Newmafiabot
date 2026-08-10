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

export const eveningFormatAffectsElo = (value: unknown): boolean =>
  normalizeEveningFormat(value) !== 'NOVICE';
