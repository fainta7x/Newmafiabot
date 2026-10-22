/**
 * The one way the app shows a club date (domain model, 2026-10-22): always Moscow time, Russian words, and a
 * fixed set of styles, so the same date never reads differently on two screens of the same kind.
 * - numeric: 22.10.2026
 * - short: 22 окт. 2026 г.
 * - long: 22 октября 2026 г.
 * - short-time: 22 окт. 2026 г., 21:00
 */
export type MoscowDateStyle = 'numeric' | 'short' | 'long' | 'short-time';

const STYLES: Record<MoscowDateStyle, Intl.DateTimeFormatOptions> = {
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
  short: { day: '2-digit', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  'short-time': { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
};

/**
 * `empty` is shown for a missing date; an unreadable value is shown as `empty` too, or as itself with
 * `invalidAsRaw` (archive screens that may hold a hand-typed date).
 */
export function formatMoscowDate<T extends string | null = string | null>(
  value: string | null | undefined,
  style: MoscowDateStyle = 'numeric',
  options: { empty?: T; invalidAsRaw?: boolean } = {},
): string | T {
  const empty = (options.empty ?? null) as T;
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return options.invalidAsRaw ? value : empty;
  return new Intl.DateTimeFormat('ru-RU', { ...STYLES[style], timeZone: 'Europe/Moscow' }).format(date);
}
