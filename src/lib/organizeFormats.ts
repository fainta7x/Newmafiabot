import { normalizeEveningFormat } from './eveningFormat.ts';
import { hostFormatForEvening } from './hostFormats.ts';

/**
 * «Может проводить вечера» (owner decision 2026-09-28): which kinds of evenings a player may create
 * in the calendar and run as its organizer, in a limited cabinet. Independent marks, given only by the owner.
 * Stored in `players.organize_formats` as a comma list (NULL = none).
 * CUSTOM is a separate non-Mafia event permission; it is never passed to game-evening logic.
 * TOURNAMENT (owner decision 2026-09-29): tournaments are separate events with their own mark, apart
 * from RATING (rating evenings). Players who had the old «Рейтинг и турниры» mark got both once
 * (migration in src/db/ensureJudgeAuthoritySchema.ts).
 */
export const ORGANIZE_FORMATS = ['NOVICE', 'CASUAL', 'RATING', 'TOURNAMENT', 'CUSTOM'] as const;
export type OrganizeFormat = (typeof ORGANIZE_FORMATS)[number];

export const ORGANIZE_FORMAT_OPTIONS: Array<{ value: OrganizeFormat; label: string; hint: string }> = [
  { value: 'NOVICE', label: 'Вечера для новичков', hint: 'Может создать вечер для новичков и провести его' },
  { value: 'CASUAL', label: 'Клубные вечера', hint: 'Может создать клубный вечер и провести его' },
  { value: 'RATING', label: 'Рейтинговые вечера', hint: 'Может создать рейтинговый вечер и провести его' },
  { value: 'TOURNAMENT', label: 'Турниры', hint: 'Может быть организатором турнира' },
  { value: 'CUSTOM', label: 'Свои ивенты', hint: 'Может создать и провести отдельное событие без игр в мафию' },
];

export const normalizeOrganizeFormats = (values: unknown): OrganizeFormat[] => {
  const list = Array.isArray(values) ? values : String(values ?? '').split(',');
  const picked = new Set(list.map((item) => String(item).trim().toUpperCase()));
  return ORGANIZE_FORMATS.filter((format) => picked.has(format));
};

/** Game evenings a marked player may create and run. Tournaments have their own flow and mark. */
export const canOrganizeEveningFormat = (player: { organize_formats?: unknown } | null | undefined, eveningFormat: unknown): boolean =>
  normalizeEveningFormat(eveningFormat) !== 'TOURNAMENT'
  && normalizeOrganizeFormats(player?.organize_formats).includes(hostFormatForEvening(eveningFormat));

export const canOrganizeTournaments = (player: { organize_formats?: unknown } | null | undefined): boolean =>
  normalizeOrganizeFormats(player?.organize_formats).includes('TOURNAMENT');

/** Marks that open the limited «Мои вечера» cabinet. «Турниры» only lets the player be chosen as a tournament organizer. */
export const cabinetOrganizeFormats = (values: unknown): OrganizeFormat[] =>
  normalizeOrganizeFormats(values).filter((format) => format !== 'TOURNAMENT');

export const canOrganizeCustomEvents = (player: { organize_formats?: unknown } | null | undefined): boolean =>
  normalizeOrganizeFormats(player?.organize_formats).includes('CUSTOM');

export const organizeFormatsSummary = (formats: OrganizeFormat[]): string => {
  if (!formats.length) return 'Не проводит';
  const short: Record<OrganizeFormat, string> = { NOVICE: 'новички', CASUAL: 'клубные', RATING: 'рейтинговые', TOURNAMENT: 'турниры', CUSTOM: 'свои ивенты' };
  return `Проводит: ${formats.map((format) => short[format]).join(', ')}`;
};
