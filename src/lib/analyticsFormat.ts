export function formatShare(part: number, whole: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0 || part < 0) return '—';
  const share = part / whole * 100;
  if (!Number.isFinite(share)) return '—';
  return `${share.toLocaleString('ru-RU', { minimumFractionDigits: share < 10 ? 1 : 0, maximumFractionDigits: share < 10 ? 1 : 0 })}%`;
}
