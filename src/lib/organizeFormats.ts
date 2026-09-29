import { hostFormatForEvening, type HostFormat } from './hostFormats.ts';

/**
 * «Может проводить вечера» (owner decision 2026-09-28): which kinds of evenings a player may create
 * in the calendar and run as its organizer, in a limited cabinet. Independent marks, given only by the owner.
 * Stored in `players.organize_formats` as a comma list (NULL = none).
 * «Свои ивенты» is agreed but there is no such evening type yet; it will be added with it.
 */
export const ORGANIZE_FORMATS = ['NOVICE', 'CASUAL', 'RATING'] as const;
export type OrganizeFormat = (typeof ORGANIZE_FORMATS)[number];

export const ORGANIZE_FORMAT_OPTIONS: Array<{ value: OrganizeFormat; label: string; hint: string }> = [
  { value: 'NOVICE', label: 'Вечера для новичков', hint: 'Может создать вечер для новичков и провести его' },
  { value: 'CASUAL', label: 'Клубные вечера', hint: 'Может создать клубный вечер и провести его' },
  { value: 'RATING', label: 'Рейтинг и турниры', hint: 'Может создать рейтинговый вечер или турнир и провести его' },
];

export const normalizeOrganizeFormats = (values: unknown): OrganizeFormat[] => {
  const list = Array.isArray(values) ? values : String(values ?? '').split(',');
  const picked = new Set(list.map((item) => String(item).trim().toUpperCase()));
  return ORGANIZE_FORMATS.filter((format) => picked.has(format));
};

export const canOrganizeEveningFormat = (player: { organize_formats?: unknown } | null | undefined, eveningFormat: unknown): boolean =>
  normalizeOrganizeFormats(player?.organize_formats).includes(hostFormatForEvening(eveningFormat) as HostFormat & OrganizeFormat);

export const organizeFormatsSummary = (formats: OrganizeFormat[]): string => {
  if (!formats.length) return 'Не проводит';
  const short: Record<OrganizeFormat, string> = { NOVICE: 'новички', CASUAL: 'клубные', RATING: 'рейтинг и турниры' };
  return `Проводит: ${formats.map((format) => short[format]).join(', ')}`;
};
