/**
 * The seat colours of the number badges (`liveGameJudge.css`, `.live-seat-number[data-seat]`): `fill` is the badge, `line` its
 * border. The vote count colours a voter by the candidate they voted for with these (owner, 2026-10-27).
 */
export const SEAT_COLORS: Record<number, { fill: string; line: string }> = {
  1: { fill: '#2563eb', line: '#60a5fa' },
  2: { fill: '#ea580c', line: '#fb923c' },
  3: { fill: '#ca8a04', line: '#facc15' },
  4: { fill: '#dc2626', line: '#f87171' },
  5: { fill: '#15803d', line: '#4ade80' },
  6: { fill: '#0891b2', line: '#22d3ee' },
  7: { fill: '#db2777', line: '#f472b6' },
  8: { fill: '#7c3aed', line: '#a78bfa' },
  9: { fill: '#92400e', line: '#d97706' },
  10: { fill: '#4d7c0f', line: '#84cc16' },
};

/** CSS custom properties for an element coloured as seat `seat` (none for an unknown seat). */
export const seatColorVars = (seat: number | undefined): Record<string, string> => {
  const color = seat === undefined ? undefined : SEAT_COLORS[seat];
  return color ? { '--seat-fill': color.fill, '--seat-line': color.line } : {};
};
