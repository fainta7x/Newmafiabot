export function formatShare(part: number, whole: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0 || part < 0) return '—';
  const share = part / whole * 100;
  if (!Number.isFinite(share)) return '—';
  // Round first, then pick the format from the rounded value: 9.96 % is «10%», not «10,0%».
  const oneDecimal = Math.round(share * 10) / 10;
  const digits = oneDecimal < 10 ? 1 : 0;
  return `${(digits ? oneDecimal : Math.round(share)).toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function analyticsSummary(data: { completedEvenings: number; totalAttended: number; newPlayers: number; fillRate: number | null }, label: string) {
  return `${label}: вечеров — ${data.completedEvenings}, визитов — ${data.totalAttended}, новых игроков — ${data.newPlayers}. Заполняемость — ${data.fillRate === null ? 'нет данных' : formatShare(data.fillRate, 1)}.`;
}
