// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { tournamentDealKey, validTournamentDealState, saveTournamentDealState, loadTournamentDealState, clearTournamentDealState } from '../lib/tournamentDealState.ts';
import type { GameRole } from '../shared/gameRoles.ts';

const seats = Array.from({ length: 10 }, (_, i) => i + 1);
const roles: GameRole[] = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don', 'sheriff'];
const cards = roles.map((role, i) => ({ id: String(i), role }));
const afterThree = () => ({
  deck: cards.slice(3),
  history: cards.slice(0, 3).map((card, i) => ({
    seat: i + 1, cardId: card.id, role: card.role, previousDeck: cards.slice(i),
  })),
  layout: cards.map((card) => card.id),
  seat: 4,
  selectedId: cards[3].id,
  showRole: true,
  started: true,
  go: true,
});

beforeEach(() => localStorage.clear());

describe('tournament virtual deal checkpoints', () => {
  it('restores three assigned roles and a revealed fourth card after a simulated reload', () => {
    const key = tournamentDealKey('tournament-a', 'game-1');
    const state = afterThree();
    expect(saveTournamentDealState(key, state, seats)).toBe(true);
    const recovered = loadTournamentDealState(key, seats)!;
    expect(recovered.history.map((item) => [item.seat, item.role])).toEqual([
      [1, 'citizen'], [2, 'citizen'], [3, 'citizen'],
    ]);
    expect(recovered.deck).toHaveLength(7);
    expect(recovered.selectedId).toBe('3');
    expect(recovered.showRole).toBe(true);
    // Undo is still possible after a reload because the previous deck is checkpointed.
    const last = recovered.history[recovered.history.length - 1];
    expect(last.previousDeck).toHaveLength(8);
    expect(last.previousDeck.find((card) => card.id === last.cardId)?.role).toBe(last.role);
  });

  it('isolates all roles and cards between tournament games', () => {
    const first = tournamentDealKey('tournament-a', 'game-1');
    const second = tournamentDealKey('tournament-a', 'game-2');
    expect(saveTournamentDealState(first, afterThree(), seats)).toBe(true);
    expect(loadTournamentDealState(second, seats)).toBeNull();
    expect(saveTournamentDealState(second, { ...afterThree(), seat: 5 }, seats)).toBe(true);
    clearTournamentDealState(first);
    expect(loadTournamentDealState(first, seats)).toBeNull();
    expect(loadTournamentDealState(second, seats)?.seat).toBe(5);
  });

  it('rejects duplicate, missing, tampered or mismatched roles without replacing evidence', () => {
    const state = afterThree();
    expect(validTournamentDealState(state, seats)).toBe(true);
    expect(validTournamentDealState({ ...state, deck: state.deck.slice(1) }, seats)).toBe(false);
    expect(validTournamentDealState({ ...state, layout: [...state.layout.slice(0, 9), state.layout[0]] }, seats)).toBe(false);
    expect(validTournamentDealState({ ...state, history: [{ ...state.history[0], seat: 4 }, ...state.history.slice(1)] }, seats)).toBe(false);
    expect(validTournamentDealState({ ...state, deck: state.deck.map((card) => ({ ...card, role: 'citizen' })) }, seats)).toBe(false);
    expect(validTournamentDealState({ ...state, selectedId: 'unknown' }, seats)).toBe(false);
    expect(saveTournamentDealState('invalid', { ...state, deck: [] }, seats)).toBe(false);
    expect(localStorage.getItem('invalid')).toBeNull();
  });

  it('never treats a corrupt or cross-game checkpoint as a valid draw', () => {
    const key = tournamentDealKey('a', 'g');
    localStorage.setItem(key, '{"deck":"broken"}');
    expect(loadTournamentDealState(key, seats)).toBeNull();
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(loadTournamentDealState(key, seats.slice(0, 9))).toBeNull();
  });
});
