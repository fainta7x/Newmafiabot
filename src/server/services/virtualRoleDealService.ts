import { randomInt, randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { isSupportedTableSize, tableRoleCounts } from '../../lib/tableComposition.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { applyPrivateVipDraw } from './vipLiveDrawService.ts';
import { migrateLegacyChaginRedGuarantee } from './vipProbabilityRulesService.ts';
import { reconcileOtherFormatExtensions, reconcileRegularEveningPayments } from './eveningPaymentPricingService.ts';
import { isCompletedClubGame } from './completedClubGame.ts';
import type { GameRole } from '../../shared/gameRoles.ts';

/** Owner, 2026-11-01: a role (card) bought during the deal costs the player this many ROUBLES. It is only recorded here; charging it to the evening's payment is not wired yet. */
export const ROLE_PURCHASE_PRICE_RUB = 150;

type Card = { id: string; role: GameRole };
type Purchase = { playerId: string | null; amountRub: number };
type Entry = { seat: number; cardId: string; role: GameRole; previousDeck: Card[]; vipPlayerIds?: string[]; purchase?: Purchase | null };
type Pending = { seat: number; cardId: string; role: GameRole; previousDeck: Card[]; vipPlayerIds?: string[] };
type State = { rosterKey?: string; version: number; deck: Card[]; history: Entry[]; pending: Pending | null };
type SeatIdentity = { seat_number: number; player_id: string | null };


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
    SELECT g.id, g.evening_id, g.protocol_text, e.format
      FROM games g JOIN game_evenings e ON e.id = g.evening_id
     WHERE g.id = ? AND g.archived_at IS NULL LIMIT 1`, [gameId]);
  if (!game) reject('Игра не найдена', 404);
  let protocol: any = null;
  try { protocol = JSON.parse(String(game.protocol_text || '')); } catch {}
  if (protocol?.kind !== 'club_evening_protocol' || isCompletedClubGame(protocol)) {
    reject('Раздача недоступна для этой игры');
  }
  const raw: SeatIdentity[] = protocol.player_results || [];
  if (!Array.isArray(raw) || !isSupportedTableSize(raw.length)) reject('Некорректный состав игры');
  const seats = raw.map((row) => Number(row.seat_number));
  if (new Set(seats).size !== raw.length || seats.some((seat) => !Number.isInteger(seat) || seat < 1 || seat > raw.length)) {
    reject('Некорректные места игроков');
  }
  const playerBySeat = new Map<number, string>(raw.filter((row) => row.player_id).map((row) => [Number(row.seat_number), String(row.player_id)]));
  return { eveningId: String(game.evening_id), format: normalizeEveningFormat(game.format), seats, playerBySeat };
}

function shuffledDeck(size: number): Card[] {
  const counts = tableRoleCounts(size);
  const roles = (Object.keys(counts) as GameRole[])
    .flatMap((role) => Array.from({ length: counts[role] }, () => role));
  const deck = roles.map((role) => ({ id: randomUUID(), role }));
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

const rosterKey = (context: Awaited<ReturnType<typeof gameContext>>) =>
  JSON.stringify(context.seats.map(seat=>[seat,context.playerBySeat.get(seat)||null]));

async function readState(db: DatabaseWrapper, gameId: number, context: Awaited<ReturnType<typeof gameContext>>): Promise<State> {
  const row = await db.get<{ state_json: string }>(
    'SELECT state_json FROM game_virtual_role_deals WHERE game_id = ? LIMIT 1', [gameId],
  );
  if (!row) return reject('Раздача не началась');
  let state: State;
  try { state = JSON.parse(row.state_json) as State; } catch { return reject('Ошибка сохранённой раздачи'); }
  if (state.rosterKey && state.rosterKey !== rosterKey(context)) reject('Состав игры изменился, начните раздачу заново');
  state.rosterKey = rosterKey(context);
  return state;
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
  await migrateLegacyChaginRedGuarantee(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, gameId);
    const previous = await tx.get<{state_json:string}>('SELECT state_json FROM game_virtual_role_deals WHERE game_id=?',[gameId]);
    const previousVersion = previous ? Number(JSON.parse(previous.state_json).version) : -1;
    const state: State = { rosterKey:rosterKey(context), version: previousVersion + 1, deck: shuffledDeck(context.seats.length), history: [], pending: null };
    await writeState(tx, gameId, state);
    return visible(state);
  });
}

export async function revealVirtualRole(db: DatabaseWrapper, gameId: number, seat: number, cardId: string, version: number) {
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, gameId);
    const state = await readState(tx, gameId, context);
    if (state.pending && state.pending.seat === seat && state.pending.cardId === cardId) {
      return { version: state.version, role: state.pending.role };
    }
    versionMatches(state, version);
    if (state.pending) reject('Сначала подтвердите открытую карту');
    if (!context.seats.includes(seat) || state.history.some((entry) => entry.seat === seat)) reject('Место уже занято');
    if (!state.deck.some((card) => card.id === cardId)) reject('Карта недоступна');
    const previousDeck = state.deck;
    const effect = await applyPrivateVipDraw(tx, gameId, context, state, seat, cardId);
    state.deck = effect.deck;
    const chosen = state.deck.find((card) => card.id === cardId)!;
    state.pending = { seat, cardId, role: chosen.role, previousDeck,
      ...(effect.vipPlayerIds.length ? { vipPlayerIds: effect.vipPlayerIds } : {}) };
    state.version += 1;
    await writeState(tx, gameId, state);
    return { version: state.version, role: chosen.role };
  });
}

export async function confirmVirtualRole(db: DatabaseWrapper, gameId: number, seat: number, cardId: string, version: number) {
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, gameId);
    const state = await readState(tx, gameId, context);
    versionMatches(state, version);
    if (!state.pending || state.pending.seat !== seat || state.pending.cardId !== cardId) return reject('Открытая карта не совпадает');
    const pending = state.pending;
    state.history.push({ ...pending });
    state.deck = state.deck.filter((card) => card.id !== cardId);
    state.pending = null;
    state.version += 1;
    await writeState(tx, gameId, state);
    return visible(state);
  });
}

/** «Покупка роли»: the judge gives the seat a role the player bought; one card of that role leaves the deck for this seat. */
async function buyVirtualRoleInner(db: DatabaseWrapper, gameId: number, seat: number, role: GameRole, version: number) {
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, gameId);
    const state = await readState(tx, gameId, context);
    versionMatches(state, version);
    // Owner, 2026-11-02: a role can be bought on every evening except rating and tournament ones.
    if (!['CASUAL', 'NOVICE'].includes(context.format)) reject('Покупка роли недоступна на рейтинговых и турнирных вечерах', 400);
    if (!['citizen', 'sheriff', 'mafia', 'don'].includes(role)) reject('Неизвестная роль', 400);
    if (state.pending) reject('Сначала подтвердите открытую карту');
    if (!context.seats.includes(seat) || state.history.some((entry) => entry.seat === seat)) reject('Место уже занято');
    const card = state.deck.find((entry) => entry.role === role);
    if (!card) return reject('Такой роли уже нет в колоде');
    const purchase: Purchase = { playerId: context.playerBySeat.get(seat) || null, amountRub: ROLE_PURCHASE_PRICE_RUB };
    state.history.push({ seat, cardId: card.id, role, previousDeck: state.deck, purchase });
    state.deck = state.deck.filter((entry) => entry.id !== card.id);
    state.version += 1;
    await writeState(tx, gameId, state);
    return { ...visible(state), priceRub: ROLE_PURCHASE_PRICE_RUB };
  });
}

async function undoVirtualRoleInner(db: DatabaseWrapper, gameId: number, version: number) {
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, gameId);
    const state = await readState(tx, gameId, context);
    versionMatches(state, version);
    if (state.pending) reject('Сначала подтвердите открытую карту');
    const last = state.history.pop();
    if (!last) return reject('Нет выданных карт');
    state.deck = last.previousDeck;
    state.version += 1;
    await writeState(tx, gameId, state);
    return visible(state);
  });
}

async function resetVirtualRoleDealInner(db: DatabaseWrapper, gameId: number, version: number) {
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, gameId);
    const { seats } = context;
    const state = await readState(tx, gameId, context);
    versionMatches(state, version);
    state.deck = shuffledDeck(seats.length);
    state.history = [];
    state.pending = null;
    state.version += 1;
    await writeState(tx, gameId, state);
    return visible(state);
  });
}

/** A bought role is part of the evening's debt: after every change of the deal the evening's payments are recomputed. */
const syncEveningPayments = async (db: DatabaseWrapper, gameId: number) => {
  try {
    const game = await db.get<{ evening_id: string }>('SELECT evening_id FROM games WHERE id = ? LIMIT 1', [gameId]);
    if (game?.evening_id) {
      await reconcileRegularEveningPayments(db, String(game.evening_id));
      await reconcileOtherFormatExtensions(db, String(game.evening_id));
    }
  } catch (error) { console.error('role purchase payment sync failed', error); }
};
export async function buyVirtualRole(db: DatabaseWrapper, gameId: number, seat: number, role: GameRole, version: number) {
  const result = await buyVirtualRoleInner(db, gameId, seat, role, version);
  await syncEveningPayments(db, gameId);
  return result;
}
export async function undoVirtualRole(db: DatabaseWrapper, gameId: number, version: number) {
  const result = await undoVirtualRoleInner(db, gameId, version);
  await syncEveningPayments(db, gameId);
  return result;
}
export async function resetVirtualRoleDeal(db: DatabaseWrapper, gameId: number, version: number) {
  const result = await resetVirtualRoleDealInner(db, gameId, version);
  await syncEveningPayments(db, gameId);
  return result;
}
