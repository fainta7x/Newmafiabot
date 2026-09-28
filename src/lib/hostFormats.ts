import { normalizeEveningFormat } from './eveningFormat.ts';

/**
 * «Может вести» (owner decision 2026-09-28): which kinds of evenings a player may host, as independent marks.
 * Hosting a novice evening is not "easier" than a club one, so there is no skill ladder.
 *
 * Stored in `players.host_formats` as a comma list. When it is NULL the marks come from the legacy
 * `judge_level` ladder, so existing players keep exactly what they could do before.
 * `judge_level` is still written as a compatibility summary: rating/tournament → judge, club → host,
 * novice only → trainee. Rules that read it (tournament chief judge, fee exemption, music) keep working.
 */
export const HOST_FORMATS = ['NOVICE', 'CASUAL', 'RATING'] as const;
export type HostFormat = (typeof HOST_FORMATS)[number];

export const HOST_FORMAT_OPTIONS: Array<{ value: HostFormat; label: string; hint: string }> = [
  { value: 'NOVICE', label: 'Вечера для новичков', hint: 'Объясняет правила и ведёт игры новичков' },
  { value: 'CASUAL', label: 'Клубные вечера', hint: 'Ведёт обычные клубные игры' },
  { value: 'RATING', label: 'Рейтинг и турниры', hint: 'Ведёт рейтинговые игры, может быть главным судьёй турнира' },
];

type LegacyJudgeLevel = 'none' | 'trainee' | 'host' | 'judge';

const LEGACY_FORMATS: Record<LegacyJudgeLevel, HostFormat[]> = {
  none: [],
  trainee: ['NOVICE'],
  host: ['NOVICE', 'CASUAL'],
  judge: ['NOVICE', 'CASUAL', 'RATING'],
};

export const normalizeHostFormats = (values: unknown): HostFormat[] => {
  const list = Array.isArray(values) ? values : String(values ?? '').split(',');
  const picked = new Set(list.map((item) => String(item).trim().toUpperCase()));
  return HOST_FORMATS.filter((format) => picked.has(format));
};

/** The player's marks: stored ones, or the ones implied by the legacy judge level. */
export const hostFormatsOf = (player: { host_formats?: unknown; judge_level?: unknown } | null | undefined): HostFormat[] => {
  if (!player) return [];
  if (player.host_formats !== null && player.host_formats !== undefined) return normalizeHostFormats(player.host_formats);
  const level = String(player.judge_level || 'none') as LegacyJudgeLevel;
  return LEGACY_FORMATS[level] ? [...LEGACY_FORMATS[level]] : [];
};

export const hostFormatForEvening = (format: unknown): HostFormat => {
  const normalized = normalizeEveningFormat(format);
  if (normalized === 'NOVICE') return 'NOVICE';
  if (normalized === 'CASUAL') return 'CASUAL';
  return 'RATING';
};

export const canHostEveningFormat = (
  player: { host_formats?: unknown; judge_level?: unknown } | null | undefined,
  eveningFormat: unknown,
): boolean => hostFormatsOf(player).includes(hostFormatForEvening(eveningFormat));

export const legacyJudgeLevelFor = (formats: HostFormat[]): LegacyJudgeLevel => {
  if (formats.includes('RATING')) return 'judge';
  if (formats.includes('CASUAL')) return 'host';
  if (formats.includes('NOVICE')) return 'trainee';
  return 'none';
};

export const hostFormatsSummary = (formats: HostFormat[]): string => {
  if (!formats.length) return 'Не ведёт';
  const short: Record<HostFormat, string> = { NOVICE: 'новички', CASUAL: 'клубные', RATING: 'рейтинг и турниры' };
  return `Ведёт: ${formats.map((format) => short[format]).join(', ')}`;
};
