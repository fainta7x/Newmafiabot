import { randomInt, randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { isSupportedTableSize, tableRoleCounts } from '../../lib/tableComposition.ts';
import { exchangeClosedRolesForDraw } from '../../lib/closedDeckRoleExchange.ts';
import type { GameRole } from '../../shared/gameRoles.ts';

type Card = { id: number; role: GameRole };
type Entry = { seat: number; cardId: number; role: GameRole; previousDeck: Card[] };
type Pending = { seat: number; cardId: number; role: GameRole; previousDeck: Card[] };
type State = { version: number; deck: Card[]; history: Entry[]; pending: Pending | null };
type SeatIdentity = { seat_number: number; player_id: string | null };

const TARGET_PLAYER_ID = 'fad23405-9715-566f-acd9-5632c30eb198';

class DealError extends Error {
  constructor(message: string, readonly statusCode = 409) { super(message); }
}
const reject = (message: string, statusCode = 409): never => { throw new DealError(message, statusCode); };

export async function ensureVirtualRoleDealSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS game_virtual_role_deals (
    game_id INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

async function gameContext(db: DatabaseWrapper, gameId: number) {
  if (!Number.isInteger(gameId) || gameId <= 0) reject('Некорректная игра', 400);
  const game = await db.get<any>(`
    SELECT g.id, g.protocol_text, e.format
      FROM games g JOIN game_evenings e ON e.id = g.evening_id
     WHERE g.id = ? AND g.archived_at IS NULL LIMIT 1`, [gameId]);
  if (!game) reject('Игра не найдена', 404);
  let protocol: any = null;
  try { protocol = JSON.parse(String(game.protocol_text || '')); } catch {}
  if (protocol?.kind !== 'club_evening_protocol' || protocol?.protocol?.status === 'completed') {
    reject('Раздача недоступна для этой игры');
  }
  const raw: SeatIdentity[] = protocol.player_results || [];
  if (!Array.isArray(raw) || !isSupportedTableSize(raw.length)) reject('Некорректный состав игры');
  const seats = raw.map((row) => Number(row.seat_number));
  if (new Set(seats).size !== raw.length || seats.some((seat) => !Number.isInteger(seat) || seat < 1 || seat > raw.length)) {
    reject('Некорректные места игроков');
  }
  const eligible = ['CASUAL', 'NOVICE'].includes(String(game.format || '').toUpperCase());
  const target = eligible ? raw.filter((row) => String(row.player_id || '') === TARGET_PLAYER_ID) : [];
  return { seats, targetSeat: target.length === 1 ? Number(target[0].seat_number) : null };
}

function shuffledDeck(size: number): Card[] {
  const counts = tableRoleCounts(size);
  const roles = (Object.keys(counts) as GameRole[])
    .flatMap((role) => Array.from({ length: counts[role] }, () => role));
  const deck = roles.map((role, id) => ({ id, role }));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const visible = (state: State) => ({
  version: state.version,
  cards: state.deck.map((card) => ({ id: card.id })),
  history: state.history.map(({ seat, cardId, role }) => ({ seat, cardId, role })),
});

async function readState(db: DatabaseWrapper, gameId: number): Promise<State> {
  const row = await db.get<{ state_json: string }>(
    'SELECT state_json FROM game_virtual_role_deals WHERE game_id = ? LIMIT 1', [gameId],
  );
  if (!row) reject('Раздача не началась');
  try { return JSON.parse(row.state_json) as State; } catch { return reject('Ошибка сохранённой раздачи'); }
}

async function writeState(db: DatabaseWrapper, gameId: number, state: State) {
  await db.run('INSERT INTO game_virtual_role_deals (game_id,state_json,updated_at) VALUES (?,?,?) ON CONFLICT(game_id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at',
    [gameId, JSON.stringify(state), new Date().toISOString()]);
}

const versionMatches = (state: State, version: number) => {
  if (!Number.isInteger(version) || state.version !== version) reject('Состояние раздачи изменилось, обновите экран');
};

export async function openVirtualRoleDeal(db: DatabaseWrapper, gameId: number) {
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const { seats } = await gameContext(tx, gameId);
    const state: State = { version: 0, deck: shuffledDeck(seats.length), history: [], pending: null };
    await writeState(tx, gameId, state);
    return visible(state);
  });
}

export async function revealVirtualRole(db: DatabaseWrapper, gameId: number, seat: number, cardId: number, version: number) {
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, gameId);
    const state = await readState(tx, gameId);
    if (state.pending && state.pending.seat === seat && state.pending.cardId === cardId) {
      return { version: state.version, role: state.pending.role };
    }
    versionMatches(state, version);
    if (state.pending) reject('Сначала подтвердите открытую карту');
    if (!context.seats.includes(seat) || state.history.some((entry) => entry.seat === seat)) reject('Место уже занято');
    if (!state.deck.some((card) => card.id === cardId)) reject('Карта недоступна');
    const previousDeck = state.deck;
    state.deck = exchangeClosedRolesForDraw(
      state.deck, cardId, context.targetSeat === seat,
      context.targetSeat !== null && context.targetSeat !== seat
        && !state.history.some((entry) => entry.seat === context.targetSeat),
    );
    const chosen = state.deck.find((card) => card.id === cardId)!;
    state.pending = { seat, cardId, role: chosen.role, previousDeck };
    state.version += 1;
    await writeState(tx, gameId, state);
    return { version: state.version, role: chosen.role };
  });
}

export async function confirmVirtualRole(db: DatabaseWrapper, gameId: number, seat: number, cardId: number, version: number) {
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    await gameContext(tx, gameId);
    const state = await readState(tx, gameId);
    versionMatches(state, version);
    if (!state.pending || state.pending.seat !== seat || state.pending.cardId !== cardId) reject('Открытая карта не совпадает');
    const pending = state.pending;
    state.history.push({ ...pending });
    state.deck = state.deck.filter((card) => card.id !== cardId);
    state.pending = null;
    state.version += 1;
    await writeState(tx, gameId, state);
    return visible(state);
  });
}

export async function undoVirtualRole(db: DatabaseWrapper, gameId: number, version: number) {
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    await gameContext(tx, gameId);
    const state = await readState(tx, gameId);
    versionMatches(state, version);
    if (state.pending) reject('Сначала подтвердите открытую карту');
    const last = state.history.pop();
    if (!last) reject('Нет выданных карт');
    state.deck = last.previousDeck;
    state.version += 1;
    await writeState(tx, gameId, state);
    return visible(state);
  });
}

export async function resetVirtualRoleDeal(db: DatabaseWrapper, gameId: number, version: number) {
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const { seats } = await gameContext(tx, gameId);
    const state = await readState(tx, gameId);
    versionMatches(state, version);
    state.deck = shuffledDeck(seats.length);
    state.history = [];
    state.pending = null;
    state.version += 1;
    await writeState(tx, gameId, state);
    return visible(state);
  });
}
