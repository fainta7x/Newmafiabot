import { useSyncExternalStore } from 'react';

type TableDecisionSelectionState = {
  active: boolean;
  key: string | null;
  selectedVoterSlots: number[];
};

export type TableDecisionSelectionSnapshot = {
  key: string | null;
  selectedVoterSlots: number[];
};

let state: TableDecisionSelectionState = {
  active: false,
  key: null,
  selectedVoterSlots: [],
};

const listeners = new Set<() => void>();

const publish = (next: TableDecisionSelectionState) => {
  state = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const normalizeSelectedSlots = (selectedVoterSlots: unknown): number[] => {
  if (!Array.isArray(selectedVoterSlots)) return [];
  return Array.from(new Set(
    selectedVoterSlots
      .map((slot) => Number(slot))
      .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10),
  ));
};

const readRecoveredSelection = (key: string): number[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('mafia_live_session');
    if (!raw) return [];
    const recovered = JSON.parse(raw);
    if (recovered?.tableDecisionSelectionKey !== key) return [];
    return normalizeSelectedSlots(recovered?.tableDecisionSelectedVoterSlots);
  } catch {
    return [];
  }
};

export const activateTableDecisionSelection = (key: string) => {
  if (state.active && state.key === key) return;
  publish({ active: true, key, selectedVoterSlots: readRecoveredSelection(key) });
};

export const deactivateTableDecisionSelection = () => {
  if (!state.active && state.selectedVoterSlots.length === 0) return;
  publish({ active: false, key: null, selectedVoterSlots: [] });
};

export const toggleTableDecisionVoter = (slot: number) => {
  if (!state.active) return;
  const selected = state.selectedVoterSlots.includes(slot);
  publish({
    ...state,
    selectedVoterSlots: selected
      ? state.selectedVoterSlots.filter((value) => value !== slot)
      : [...state.selectedVoterSlots, slot],
  });
};

export const getTableDecisionSelectionSnapshot = (): TableDecisionSelectionSnapshot => ({
  key: state.active ? state.key : null,
  selectedVoterSlots: state.active ? [...state.selectedVoterSlots] : [],
});

export const restoreTableDecisionSelection = (
  key: string | null,
  selectedVoterSlots: number[] = [],
) => {
  if (!key) {
    deactivateTableDecisionSelection();
    return;
  }
  publish({ active: true, key, selectedVoterSlots: normalizeSelectedSlots(selectedVoterSlots) });
};

export const useTableDecisionSelection = (): TableDecisionSelectionState => useSyncExternalStore(
  subscribe,
  () => state,
  () => state,
);
