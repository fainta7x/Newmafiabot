import type { PlayerResultData } from './api';

export type DeathProtocolSelection = {
  red: number[];
  black: number[];
  sheriff: number[];
};

export type StoredDeathProtocols = Record<number, DeathProtocolSelection>;

const STORAGE_KEY = 'mafia_live_death_protocols';

export const emptyDeathProtocolSelection = (): DeathProtocolSelection => ({
  red: [],
  black: [],
  sheriff: [],
});

const validSeats = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map(Number)
      .filter((seat) => Number.isInteger(seat) && seat >= 1 && seat <= 10),
  )).sort((a, b) => a - b);
};

export const normalizeDeathProtocolSelection = (value: any): DeathProtocolSelection => {
  const red = validSeats(value?.red);
  const black = validSeats(value?.black).filter((seat) => !red.includes(seat));
  const sheriff = validSeats(value?.sheriff).slice(0, 1);
  return { red, black, sheriff };
};

export const readStoredDeathProtocols = (): StoredDeathProtocols => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const next: StoredDeathProtocols = {};
    Object.entries(parsed || {}).forEach(([rawSlot, value]) => {
      const slot = Number(rawSlot);
      if (Number.isInteger(slot) && slot >= 1 && slot <= 10) {
        next[slot] = normalizeDeathProtocolSelection(value);
      }
    });
    return next;
  } catch {
    return {};
  }
};

export const storeDeathProtocol = (slot: number, value: DeathProtocolSelection) => {
  if (!Number.isInteger(slot) || slot < 1 || slot > 10) return;
  const current = readStoredDeathProtocols();
  current[slot] = normalizeDeathProtocolSelection(value);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch {}
};

export const clearStoredDeathProtocols = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

export const applyStoredDeathProtocolsToResults = (results: PlayerResultData[]): PlayerResultData[] => {
  const stored = readStoredDeathProtocols();
  if (!Object.keys(stored).length) return results;

  return results.map((result) => {
    const selection = stored[result.seat_number];
    if (!selection || result.exit_type !== 'killed') return result;

    const colorProtocol: PlayerResultData['color_protocol'] = [];
    if (selection.red.length) colorProtocol.push({ mark: 'red', seat_numbers: [...selection.red] });
    if (selection.black.length) colorProtocol.push({ mark: 'black', seat_numbers: [...selection.black] });
    if (selection.sheriff.length) colorProtocol.push({ mark: 'sheriff', seat_numbers: [...selection.sheriff] });

    return { ...result, color_protocol: colorProtocol };
  });
};
