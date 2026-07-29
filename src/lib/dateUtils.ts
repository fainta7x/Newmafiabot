import { GameEvening } from './api.ts';

/**
 * Formats an evening ISO date string into a localized Russian date and time string,
 * using the provided timezone or defaulting to Europe/Moscow.
 */
export function formatEveningDateTime(startsAt: string, timezone?: string | null): string {
  const tz = timezone && timezone.trim() !== '' ? timezone : 'Europe/Moscow';
  try {
    const dateObj = new Date(startsAt);
    const dateFormatted = dateObj.toLocaleDateString('ru-RU', {
      timeZone: tz,
      day: 'numeric',
      month: 'long',
      weekday: 'short',
    });
    const timeFormatted = dateObj.toLocaleTimeString('ru-RU', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dateFormatted} в ${timeFormatted}`;
  } catch (_e) {
    const dateObj = new Date(startsAt);
    return dateObj.toLocaleString('ru-RU');
  }
}

/**
 * Filters out completed, cancelled, and past evenings (using new Date(...).getTime() > nowMs)
 * and sorts remaining future evenings ascending by date (nearest first).
 */
export function getSortedFutureEvenings(evenings: GameEvening[], nowMs: number = Date.now()): GameEvening[] {
  return evenings
    .filter((e) => {
      if (e.status === 'completed' || e.status === 'cancelled') return false;
      if (!e.starts_at) return false;
      const eveningTime = new Date(e.starts_at).getTime();
      return !isNaN(eveningTime) && eveningTime > nowMs;
    })
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}
