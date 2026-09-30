/**
 * «Куратор направления» (owner decisions 2026-09-28 and 2026-09-30): players responsible for a part of club life.
 * Independent marks stored in `players.curator_areas` as a comma list (NULL = none). They give no rights in the app;
 * «Дела» reminds the organizer when a curator's direction has been quiet for a while.
 */
export const CURATOR_AREAS = ['NOVICES', 'LEARNING', 'EVENTS', 'TOURNAMENTS', 'DISCIPLINE', 'SMM'] as const;
export type CuratorArea = (typeof CURATOR_AREAS)[number];

export const CURATOR_AREA_OPTIONS: Array<{ value: CuratorArea; label: string; hint: string }> = [
  { value: 'NOVICES', label: 'Новички', hint: 'Встречает новичков, ведёт их первые вечера' },
  { value: 'LEARNING', label: 'Обучение', hint: 'Занятия, разборы игр, учит вести' },
  { value: 'EVENTS', label: 'Ивенты и активности', hint: 'Свои ивенты клуба: квизы, кино, выезды' },
  { value: 'TOURNAMENTS', label: 'Турниры', hint: 'Организует турниры' },
  { value: 'DISCIPLINE', label: 'Дисциплина', hint: 'Правила поведения на вечерах, баны' },
  { value: 'SMM', label: 'СММ', hint: 'Фото, посты, истории' },
];

export const normalizeCuratorAreas = (values: unknown): CuratorArea[] => {
  const list = Array.isArray(values) ? values : String(values ?? '').split(',');
  const picked = new Set(list.map((item) => String(item).trim().toUpperCase()));
  return CURATOR_AREAS.filter((area) => picked.has(area));
};

export const curatorAreaLabel = (area: CuratorArea) => CURATOR_AREA_OPTIONS.find((item) => item.value === area)?.label || area;

export const curatorAreasSummary = (areas: CuratorArea[]): string =>
  areas.length ? areas.map((area) => curatorAreaLabel(area).toLowerCase()).join(', ') : 'Нет';
