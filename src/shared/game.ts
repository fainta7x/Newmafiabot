import type { EveningFormat } from '../lib/eveningFormat.ts';

/**
 * «Игра» — ONE entity for every game of the club (owner, 2026-11-03; docs/ARCHITECTURE_REVIEW_2026-11-03.md, step 1).
 * Today the games live in two tables (`games` for every game of an evening, `tournament_games`); this type is the one
 * shape every feature reads, so a feature is written once and works for every game. A new format is a new value of
 * `format`, never a new table or a copied window.
 */
export type GameStorage = 'club' | 'tournament';
/** The format of the game: the evening's format for a game of an evening, TOURNAMENT for a tournament game. */
export type GameFormat = EveningFormat;
export type GameStatus = 'planned' | 'running' | 'completed' | 'cancelled' | 'archived';

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  planned: 'Запланирована',
  running: 'Идёт',
  completed: 'Завершена',
  cancelled: 'Отменена',
  archived: 'В архиве',
};

/** `club:<games.id>` or `tournament:<tournament_games.id>` — the same key the live engine uses for its session. */
export type GameKey = `${GameStorage}:${string}`;

export interface GameSeat { seat: number; playerId: string | null; nickname: string; role: string | null }

export interface Game {
  key: GameKey;
  storage: GameStorage;
  /** The row id inside its storage table. */
  id: string;
  format: GameFormat;
  status: GameStatus;
  /** The event the game belongs to: an evening or a tournament. */
  eventId: string | null;
  eventKind: 'evening' | 'tournament' | null;
  /** Status of that event (evening or tournament status as stored). */
  eventStatus: string | null;
  /** Number of the game: the club's global number, or the number inside the tournament. */
  number: number | null;
  date: string | null;
  winner: 'red' | 'black' | null;
  judgePlayerId: string | null;
  /** As written in the protocol (an external judge has no profile). */
  judgeName: string | null;
  /** Title of the event (evening or tournament) and the table of an evening game. */
  eventTitle: string | null;
  tableName: string | null;
  seats: GameSeat[];
}

/** One seat's result of a game, the same fields for every format (the protocol core's names). */
export interface GameSeatResult {
  seat: number;
  participantId: string | null;
  playerId: string | null;
  nickname: string;
  role: string | null;
  exitType: string | null;
  regularFouls: number;
  minorTechnicalFouls: number;
  majorTechnicalFouls: number;
  judgeBonus: number;
  protocolBonus: number;
  ciPoints: number;
  penaltyPoints: number;
  disciplinaryPenaltyPoints: number;
  bestMoveSource: 'first_killed' | 'zero_round_voted' | null;
  bestMove: boolean;
  firstKilled: boolean;
  zeroRoundVoted: boolean;
}

export const gameKey = (storage: GameStorage, id: string | number): GameKey => `${storage}:${String(id)}` as GameKey;

export const parseGameKey = (value: unknown): { storage: GameStorage; id: string } | null => {
  const match = /^(club|tournament):(.+)$/.exec(String(value || '').trim());
  if (!match) return null;
  const storage = match[1] as GameStorage;
  const id = match[2];
  if (storage === 'club' && !(Number.isInteger(Number(id)) && Number(id) > 0)) return null;
  return { storage, id };
};

export const isFinishedGameStatus = (status: GameStatus) => status === 'completed' || status === 'cancelled' || status === 'archived';
