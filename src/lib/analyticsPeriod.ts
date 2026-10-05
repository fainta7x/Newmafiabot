export const ANALYTICS_ALL_SINCE = '1970-01-01T00:00:00.000Z';
export const ANALYTICS_ALL_UNTIL = '9999-12-31T00:00:00.000Z';
export type AnalyticsSeason = { title?: string; starts_at: string; ends_at: string };
export type AnalyticsRange = { id: string; label: string; since: string; until: string };

const monthStart = (year: number, month: number) => new Date(Date.UTC(year, month, 1, -3)).toISOString();
const boundary = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Date(`${value}T00:00:00+03:00`).getTime() : Date.parse(value);

/** Half-open ranges; calendar boundaries follow Moscow, not the machine timezone. */
export function parseAnalyticsPeriod(value: string, now = Date.now(), season?: AnalyticsSeason | null): AnalyticsRange {
  const days = ({ '7d': 7, '30d': 30, '90d': 90 } as Record<string, number>)[value];
  if (days) return { id: value, label: `${days} дней`, since: new Date(now - days * 86_400_000).toISOString(), until: new Date(now + 1).toISOString() };
  if (value === 'month' || value === 'prev_month') {
    const local = new Date(now + 3 * 3_600_000);
    const month = local.getUTCMonth() - (value === 'prev_month' ? 1 : 0);
    const since = monthStart(local.getUTCFullYear(), month);
    return { id: value, label: new Date(since).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }), since, until: monthStart(local.getUTCFullYear(), month + 1) };
  }
  if (value === 'season' && season) {
    const start = boundary(season.starts_at);
    const end = boundary(season.ends_at) + (/^\d{4}-\d{2}-\d{2}$/.test(season.ends_at) ? 86_400_000 : 1);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return { id: value, label: season.title || 'Сезон', since: new Date(start).toISOString(), until: new Date(end).toISOString() };
  }
  return { id: value === 'season' ? 'season' : 'all', label: value === 'season' ? 'Сезон не задан — показано всё время' : 'Всё время', since: ANALYTICS_ALL_SINCE, until: ANALYTICS_ALL_UNTIL };
}
