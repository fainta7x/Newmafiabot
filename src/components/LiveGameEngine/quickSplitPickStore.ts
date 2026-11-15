import { useSyncExternalStore } from 'react';

/**
 * «Между кем попил?» (owner, 2026-11-15): one choice shared by the «Попил» button of the numbers window, the centre panel and
 * the key Й (Q). null — not choosing; [] — choosing, nobody yet; [seat] — the first of the two is chosen.
 */
let picked: number[] | null = null;
const listeners = new Set<() => void>();
const publish = (next: number[] | null) => { picked = next; listeners.forEach((listener) => listener()); };

export const getQuickSplitPick = () => picked;
export const startQuickSplitPick = () => publish([]);
export const cancelQuickSplitPick = () => publish(null);
export const toggleQuickSplitPick = () => publish(picked === null ? [] : null);
/** Adds a seat; returns the pair once two different seats are chosen (the choice then closes). */
export const pickQuickSplitSeat = (seat: number): [number, number] | null => {
  if (picked === null) return null;
  if (!picked.length) { publish([seat]); return null; }
  if (picked[0] === seat) { publish([]); return null; }
  const pair: [number, number] = [picked[0], seat];
  publish(null);
  return pair;
};
export const useQuickSplitPick = () => useSyncExternalStore(
  (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  () => picked,
  () => null,
);
