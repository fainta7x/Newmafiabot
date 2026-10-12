/**
 * «Вскрытие» (reveal) in the Live Game engine (owner, 2026-10-12; rules in BUSINESS_RULES «Night, agreement…»):
 * a player openly says he is the Sheriff — the real Sheriff or a black player (Don / mafia) pretending to be one — and
 * names the checks he claims to have made. The judge records it by hand; the announced checks are NOT derived from the
 * real night checks. Pure helpers: the engine keeps the list in its saved session, the chronology is derived from it.
 */

export type RevealColor = 'red' | 'black';
export interface AnnouncedCheck { target: number; color: RevealColor }
export interface LiveReveal { seat: number; checks: AnnouncedCheck[] }

const validSeat = (seat: unknown, tableSize: number): seat is number =>
  Number.isInteger(seat) && (seat as number) >= 1 && (seat as number) <= tableSize;

export const normalizeReveals = (value: unknown, tableSize = 10): LiveReveal[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const out: LiveReveal[] = [];
  for (const item of value as Array<Partial<LiveReveal>>) {
    const seat = Number(item?.seat);
    if (!validSeat(seat, tableSize) || seen.has(seat)) continue;
    seen.add(seat);
    const checks: AnnouncedCheck[] = [];
    for (const check of Array.isArray(item?.checks) ? item!.checks! : []) {
      const target = Number(check?.target);
      if (!validSeat(target, tableSize) || target === seat || checks.some((existing) => existing.target === target)) continue;
      if (check.color === 'red' || check.color === 'black') checks.push({ target, color: check.color });
    }
    out.push({ seat, checks });
  }
  return out;
};

/** A seat reveals once; revealing again changes nothing. */
export const addReveal = (reveals: LiveReveal[], seat: number, tableSize = 10): LiveReveal[] => {
  if (!validSeat(seat, tableSize) || reveals.some((item) => item.seat === seat)) return reveals;
  return [...reveals, { seat, checks: [] }];
};

export const removeReveal = (reveals: LiveReveal[], seat: number): LiveReveal[] => reveals.filter((item) => item.seat !== seat);

/** One announced check per (revealed seat, target): announcing the same target again only changes the colour. */
export const setAnnouncedCheck = (reveals: LiveReveal[], seat: number, target: number, color: RevealColor, tableSize = 10): LiveReveal[] => {
  if (!validSeat(target, tableSize) || target === seat) return reveals;
  return reveals.map((item) => {
    if (item.seat !== seat) return item;
    const others = item.checks.filter((check) => check.target !== target);
    return { ...item, checks: [...others, { target, color }] };
  });
};

export const removeAnnouncedCheck = (reveals: LiveReveal[], seat: number, target: number): LiveReveal[] =>
  reveals.map((item) => (item.seat === seat ? { ...item, checks: item.checks.filter((check) => check.target !== target) } : item));

export const REVEAL_COLOR_LABELS: Record<RevealColor, string> = { red: 'красный', black: 'чёрный' };
