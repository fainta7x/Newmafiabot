export function formatShare(part: number, whole: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0 || part < 0) return '—';
  const share = part / whole * 100;
  if (!Number.isFinite(share)) return '—';
  return `${share.toLocaleString('ru-RU', { minimumFractionDigits: share < 10 ? 1 : 0, maximumFractionDigits: share < 10 ? 1 : 0 })}%`;
}

export function analyticsSummary(data: { completedEvenings: number; totalAttended: number; newPlayers: number; fillRate: number | null }, label: string) {
  return `${label}: вечеров — ${data.completedEvenings}, визитов — ${data.totalAttended}, новых игроков — ${data.newPlayers}. Заполняемость — ${data.fillRate === null ? 'нет данных' : formatShare(data.fillRate, 1)}.`;
}
