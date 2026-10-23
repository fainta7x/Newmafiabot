/** Owner rule: published or running, until explicitly closed; time is not a closing action. */
export const OPEN_EVENING_STATUSES = ['published', 'active'] as const;
export function isOpenEvening(evening: { status?: unknown; settled_at?: unknown } | null | undefined): boolean {
  return Boolean(evening && !evening.settled_at && OPEN_EVENING_STATUSES.some(status => status === evening.status));
}
/** Only trusted source aliases may be supplied, never request input. */
export function openEveningSql(alias = ''): string {
  if (alias && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid SQL alias');
  const p = alias ? `${alias}.` : '';
  return `${p}status IN ('published', 'active') AND ${p}settled_at IS NULL`;
}
