export function formatForDateTimeLocal(dateInput?: string | Date | null): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatEveningDateTime(isoDate: string, timeZone: string = 'Europe/Moscow'): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  try {
    return d.toLocaleString('ru-RU', {
      timeZone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

export function getSortedFutureEvenings<T extends { starts_at: string; status?: string }>(
  evenings: T[],
  nowMsInput?: number
): T[] {
  const referenceMs = nowMsInput ?? Date.now();
  return (evenings || [])
    .filter((e) => {
      if (e.status === 'cancelled' || e.status === 'completed') return false;
      const d = new Date(e.starts_at);
      if (isNaN(d.getTime())) return false;
      return d.getTime() >= referenceMs;
    })
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

/**
 * Manual organizer add is intentionally a little wider than public registration.
 * During a live evening the start time is already in the past, but walk-ins still
 * need to be attachable to the current roster. Keep active evenings regardless of
 * start time and retain other unfinished evenings for an 18-hour live-event window.
 */
export function getSortedAddableEvenings<T extends { starts_at: string; status?: string }>(
  evenings: T[],
  nowMsInput?: number,
): T[] {
  const referenceMs = nowMsInput ?? Date.now();
  const liveWindowStart = referenceMs - 18 * 60 * 60 * 1000;
  return (evenings || [])
    .filter((e) => {
      if (e.status === 'cancelled' || e.status === 'completed') return false;
      const startsAt = new Date(e.starts_at).getTime();
      if (!Number.isFinite(startsAt)) return false;
      return e.status === 'active' || startsAt >= liveWindowStart;
    })
    .sort((a, b) => {
      const aActive = a.status === 'active' ? 0 : 1;
      const bActive = b.status === 'active' ? 0 : 1;
      return aActive - bActive || new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    });
}
