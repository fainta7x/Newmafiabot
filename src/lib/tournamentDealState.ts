import { isSupportedTableSize, tableRoleCounts } from './tableComposition.ts';
import type { GameRole } from '../shared/gameRoles.ts';

type DealCard = { id: string; role: GameRole | null };
type DealDrawn = { seat: number; cardId: string; role: GameRole; previousDeck: DealCard[] };
export type TournamentDealState = {
  deck: DealCard[];
  history: DealDrawn[];
  layout: string[];
  seat: number;
  selectedId: string | null;
  showRole: boolean;
  started: boolean;
  go: boolean;
};

export const tournamentDealKey = (tournamentId: string, gameId: string) =>
  `mafia_tournament_virtual_deal:${encodeURIComponent(tournamentId)}:${encodeURIComponent(gameId)}`;

const isCard = (value: any): value is DealCard =>
  value && typeof value.id === 'string' &&
  ['citizen', 'mafia', 'don', 'sheriff'].includes(value.role);

export const validTournamentDealState = (value: any, seats: number[]): value is TournamentDealState => {
  if (!isSupportedTableSize(seats.length) || new Set(seats).size !== seats.length ||
    seats.some((seat) => !Number.isInteger(seat) || seat < 1 || seat > 10)) return false;
  if (!value || !Array.isArray(value.deck) || !Array.isArray(value.history) || !Array.isArray(value.layout)) return false;
  if (!value.deck.every(isCard) || !value.history.every((entry: any) =>
    entry && seats.includes(entry.seat) && typeof entry.cardId === 'string' &&
    ['citizen', 'mafia', 'don', 'sheriff'].includes(entry.role) &&
    Array.isArray(entry.previousDeck) && entry.previousDeck.every(isCard))) return false;
  const ids = [...value.deck.map((card: DealCard) => card.id), ...value.history.map((entry: DealDrawn) => entry.cardId)];
  if (ids.length !== seats.length || new Set(ids).size !== seats.length ||
    value.layout.length !== seats.length || new Set(value.layout).size !== seats.length ||
    value.layout.some((id: unknown) => typeof id !== 'string' || !ids.includes(id))) return false;
  if (new Set(value.history.map((entry: DealDrawn) => entry.seat)).size !== value.history.length) return false;
  if (!seats.includes(value.seat) || typeof value.started !== 'boolean' ||
    typeof value.go !== 'boolean' || typeof value.showRole !== 'boolean') return false;
  if (value.selectedId !== null && (typeof value.selectedId !== 'string' || !value.deck.some((card: DealCard) => card.id === value.selectedId))) return false;
  if (value.showRole !== Boolean(value.selectedId)) return false;
  if (value.showRole && !value.started) return false;
  if (value.history.some((entry: DealDrawn, i: number) =>
    entry.previousDeck.length !== seats.length - i ||
    !entry.previousDeck.some((card) => card.id === entry.cardId && card.role === entry.role))) return false;
  const counts = tableRoleCounts(seats.length);
  const allRoles = [...value.deck.map((card: DealCard) => card.role), ...value.history.map((entry: DealDrawn) => entry.role)];
  return (Object.keys(counts) as GameRole[]).every((role) => allRoles.filter((r) => r === role).length === counts[role]);
};

export const loadTournamentDealState = (key: string, seats: number[]): TournamentDealState | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!validTournamentDealState(value, seats)) {
      // Don't override suspect evidence: a judge may still need it for recovery.
      return null;
    }
    return value;
  } catch { return null; }
};

export const saveTournamentDealState = (key: string, state: TournamentDealState, seats: number[]) => {
  if (!validTournamentDealState(state, seats)) return false;
  try { localStorage.setItem(key, JSON.stringify(state)); return true; }
  catch { return false; }
};

export const clearTournamentDealState = (key: string) => {
  try { localStorage.removeItem(key); } catch { /* storage can be disabled */ }
};
