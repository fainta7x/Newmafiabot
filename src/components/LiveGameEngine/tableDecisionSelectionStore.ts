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

export const activateTableDecisionSelection = (key: string) => {
  if (state.active && state.key === key) return;
  publish({ active: true, key, selectedVoterSlots: [] });
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

  const uniqueSlots = Array.from(new Set(
    selectedVoterSlots
      .map((slot) => Number(slot))
      .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10),
  ));
  publish({ active: true, key, selectedVoterSlots: uniqueSlots });
};

export const useTableDecisionSelection = (): TableDecisionSelectionState => useSyncExternalStore(
  subscribe,
  () => state,
  () => state,
);
