import { randomInt, randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { isSupportedTableSize, tableRoleCounts } from '../../lib/tableComposition.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { protectReservedRolesForDraw } from '../../lib/protectReservedRolesForDraw.ts';
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

/**
 * One deal for every game (owner, 2026-11-09): a club game or a tournament game. A number is a club game (the old callers);
 * the card logic below is written once. What belongs to the club only (paid role reservations, the private VIP draw, the
 * evening's payments) runs for `storage: 'club'` alone; a tournament game has none of it.
 */
export type DealRef = { storage: 'club'; id: number } | { storage: 'tournament'; id: string };
export type DealGame = number | DealRef;
const toRef = (game: DealGame): DealRef => (typeof game === 'number' ? { storage: 'club', id: game } : game);
export const dealGameKey = (game: DealGame): string => { const ref = toRef(game); return `${ref.storage}:${ref.id}`; };


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
  // The deal of every non-club game, by the game's key (`tournament:<id>`). The club deal stays in the table above until
  // the services that read it (purchases, seat swaps, VIP, payments) move to this key as well.
  await db.exec(`CREATE TABLE IF NOT EXISTS game_role_deals (
    game_key TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

async function gameContext(db: DatabaseWrapper, game: DealGame) {
  const ref = toRef(game);
  if (ref.storage === 'tournament') return tournamentGameContext(db, ref.id);
  return clubGameContext(db, ref.id);
}

type DealContext = { eveningId: string; format: ReturnType<typeof normalizeEveningFormat>; seats: number[]; playerBySeat: Map<number, string> };

/** A tournament game: the seats and the players of its participants; no evening, no reservations. */
async function tournamentGameContext(db: DatabaseWrapper, gameId: string): Promise<DealContext> {
  const row = await db.get<any>(
    `SELECT tg.id, tg.status AS game_status, t.status AS tournament_status
       FROM tournament_games tg JOIN tournaments t ON t.id = tg.tournament_id WHERE tg.id = ? LIMIT 1`, [gameId]);
  if (!row) reject('Игра не найдена', 404);
  if (String(row.game_status) === 'completed') reject('Раздача недоступна для этой игры');
  const seatRows = await db.all<any>(
    `SELECT s.seat_number, tp.player_id FROM tournament_game_seats s
       JOIN tournament_participants tp ON tp.id = s.participant_id WHERE s.game_id = ? ORDER BY s.seat_number`, [gameId]);
  if (!isSupportedTableSize(seatRows.length)) reject('Некорректный состав игры');
  const seats = seatRows.map((r) => Number(r.seat_number));
  if (new Set(seats).size !== seats.length || seats.some((seat) => !Number.isInteger(seat) || seat < 1 || seat > seats.length)) {
    reject('Некорректные места игроков');
  }
  const playerBySeat = new Map<number, string>(seatRows.filter((r) => r.player_id).map((r) => [Number(r.seat_number), String(r.player_id)]));
  return { eveningId: '', format: normalizeEveningFormat('TOURNAMENT'), seats, playerBySeat };
}

async function clubGameContext(db: DatabaseWrapper, gameId: number): Promise<DealContext> {
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

/** Active pre-deal purchases are private server-only state. */
async function reservedRolesBySeat(db: DatabaseWrapper, gameId: number, playerBySeat: Map<number, string>): Promise<Map<number, GameRole>> {
  let rows: Array<{ player_id: string; role: GameRole }> = [];
  try {
    rows = await db.all<{ player_id: string; role: GameRole }>(
      "SELECT player_id, role FROM game_role_reservations WHERE game_id=? AND status='reserved'",
      [gameId],
    );
  } catch { return new Map(); } // schema absent on older installations
  const roleByPlayer = new Map(rows.map((row) => [row.player_id, row.role]));
  return new Map([...playerBySeat].flatMap(([seat, playerId]) =>
    roleByPlayer.has(playerId) ? [[seat, roleByPlayer.get(playerId)!] as const] : []));
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
  // The card opened but not yet confirmed: after a reload the judge's screen shows the very same card again.
  pending: state.pending ? { seat: state.pending.seat, cardId: state.pending.cardId, role: state.pending.role } : null,
});

const rosterKey = (context: DealContext) =>
  JSON.stringify(context.seats.map(seat=>[seat,context.playerBySeat.get(seat)||null]));

async function readState(db: DatabaseWrapper, game: DealGame, context: DealContext): Promise<State> {
  const ref = toRef(game);
  const row = ref.storage === 'club'
    ? await db.get<{ state_json: string }>('SELECT state_json FROM game_virtual_role_deals WHERE game_id = ? LIMIT 1', [ref.id])
    : await db.get<{ state_json: string }>('SELECT state_json FROM game_role_deals WHERE game_key = ? LIMIT 1', [dealGameKey(ref)]);
  if (!row) return reject('Раздача не началась');
  let state: State;
  try { state = JSON.parse(row.state_json) as State; } catch { return reject('Ошибка сохранённой раздачи'); }
  if (state.rosterKey && state.rosterKey !== rosterKey(context)) reject('Состав игры изменился, начните раздачу заново');
  state.rosterKey = rosterKey(context);
  return state;
}

async function writeState(db: DatabaseWrapper, game: DealGame, state: State) {
  const ref = toRef(game);
  const now = new Date().toISOString();
  if (ref.storage === 'club') {
    await db.run('INSERT INTO game_virtual_role_deals (game_id,state_json,updated_at) VALUES (?,?,?) ON CONFLICT(game_id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at',
      [ref.id, JSON.stringify(state), now]);
    return;
  }
  await db.run('INSERT INTO game_role_deals (game_key,state_json,updated_at) VALUES (?,?,?) ON CONFLICT(game_key) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at',
    [dealGameKey(ref), JSON.stringify(state), now]);
}

const versionMatches = (state: State, version: number) => {
  if (!Number.isInteger(version) || state.version !== version) reject('Состояние раздачи изменилось, обновите экран');
};

export async function openVirtualRoleDeal(db: DatabaseWrapper, game: DealGame) {
  const ref = toRef(game);
  await ensureVirtualRoleDealSchema(db);
  await migrateLegacyChaginRedGuarantee(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, ref);
    const previous = ref.storage === 'club'
      ? await tx.get<{state_json:string}>('SELECT state_json FROM game_virtual_role_deals WHERE game_id=?',[ref.id])
      : await tx.get<{state_json:string}>('SELECT state_json FROM game_role_deals WHERE game_key=?',[dealGameKey(ref)]);
    // Paid role reservations exist for club games only: a started deal with a purchase is kept, not reshuffled.
    const hasPurchase = ref.storage === 'club'
      ? await tx.get("SELECT 1 FROM game_role_reservations WHERE game_id=? AND status IN ('reserved','fulfilled') LIMIT 1",[ref.id]).catch(()=>null)
      : null;
    if (previous && hasPurchase) return visible(await readState(tx,ref,context));
    // A tournament deal that was interrupted (the judge's phone died, the page was reloaded) is resumed, not reshuffled:
    // the cards already handed out stay with their seats. A finished deal or another roster starts a new one.
    if (previous && ref.storage === 'tournament') {
      try {
        const kept = await readState(tx, ref, context);
        if ((kept.history.length > 0 || kept.pending) && kept.history.length < context.seats.length) return visible(kept);
      } catch { /* another roster or a broken copy: start a new deal below */ }
    }
    const previousVersion = previous ? Number(JSON.parse(previous.state_json).version) : -1;
    const state: State = { rosterKey:rosterKey(context),version:previousVersion+1,deck:shuffledDeck(context.seats.length),history:[],pending:null };
    await writeState(tx, ref, state);
    return visible(state);
  });
}

export async function revealVirtualRole(db: DatabaseWrapper, game: DealGame, seat: number, cardId: string, version: number) {
  const ref = toRef(game);
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, ref);
    const state = await readState(tx, ref, context);
    if (state.pending && state.pending.seat === seat && state.pending.cardId === cardId) {
      return { version: state.version, role: state.pending.role };
    }
    versionMatches(state, version);
    if (state.pending) reject('Сначала подтвердите открытую карту');
    if (!context.seats.includes(seat) || state.history.some((entry) => entry.seat === seat)) reject('Место уже занято');
    if (!state.deck.some((card) => card.id === cardId)) reject('Карта недоступна');
    const previousDeck = state.deck;
    // Reservations and the private VIP draw are club rules (owner, 2026-11-01/02); a tournament game draws plainly.
    const reserved = ref.storage === 'club' ? await reservedRolesBySeat(tx,ref.id,context.playerBySeat) : new Map<number, GameRole>();
    const paidDeck = reserved.size ? protectReservedRolesForDraw(state.deck,cardId,seat,reserved) : state.deck;
    const protectedClosedRoles: Partial<Record<GameRole,number>> = {};
    for (const [otherSeat,role] of reserved) {
      if(otherSeat!==seat) protectedClosedRoles[role]=(protectedClosedRoles[role]||0)+1;
    }
    const effect = (reserved.has(seat) || ref.storage !== 'club') ? {deck:paidDeck,vipPlayerIds:[] as string[]}
      : await applyPrivateVipDraw(tx,ref.id,context,{...state,deck:paidDeck},seat,cardId,protectedClosedRoles);
    state.deck=effect.deck;
    const chosen = state.deck.find((card) => card.id === cardId)!;
    state.pending = { seat, cardId, role: chosen.role, previousDeck,
      ...(effect.vipPlayerIds.length ? { vipPlayerIds: effect.vipPlayerIds } : {}) };
    state.version += 1;
    await writeState(tx, ref, state);
    return { version: state.version, role: chosen.role };
  });
}

async function confirmVirtualRoleInner(db: DatabaseWrapper, game: DealGame, seat: number, cardId: string, version: number) {
  const ref = toRef(game);
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, ref);
    const state = await readState(tx, ref, context);
    versionMatches(state, version);
    if (!state.pending || state.pending.seat !== seat || state.pending.cardId !== cardId) return reject('Открытая карта не совпадает');
    const pending = state.pending;
    const playerId = context.playerBySeat.get(seat);
    let purchase: Purchase | null = null;
    if (playerId && ref.storage === 'club') {
      const active = await tx.get<{ id: string; role: GameRole; amount_rub: number }>(
        "SELECT id, role, amount_rub FROM game_role_reservations WHERE game_id=? AND player_id=? AND status='reserved' LIMIT 1",
        [ref.id, playerId],
      ).catch(() => null);
      if (active) {
        if (active.role !== pending.role) reject('Нарушена бронь роли: раздача не может быть подтверждена');
        purchase = { playerId, amountRub: Number(active.amount_rub) };
        await tx.run(
          "UPDATE game_role_reservations SET status='fulfilled', updated_at=? WHERE id=?",
          [new Date().toISOString(), active.id],
        );
      }
    }
    state.history.push({ ...pending, purchase });
    state.deck = state.deck.filter((card) => card.id !== cardId);
    state.pending = null;
    state.version += 1;
    await writeState(tx, ref, state);
    return visible(state);
  });
}

export async function confirmVirtualRole(db: DatabaseWrapper, game: DealGame, seat: number, cardId: string, version: number) {
  const result = await confirmVirtualRoleInner(db, game, seat, cardId, version);
  await syncEveningPayments(db, game);
  return result;
}

/** «Покупка роли»: the judge gives the seat a role the player bought; one card of that role leaves the deck for this seat. */
async function buyVirtualRoleInner(db: DatabaseWrapper, game: DealGame, seat: number, role: GameRole, version: number) {
  const ref = toRef(game);
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, ref);
    const state = await readState(tx, ref, context);
    versionMatches(state, version);
    // Owner, 2026-11-02: a role can be bought on every evening except rating and tournament ones.
    if (!['CASUAL', 'NOVICE'].includes(context.format)) reject('Покупка роли недоступна на рейтинговых и турнирных вечерах', 400);
    if (!['citizen', 'sheriff', 'mafia', 'don'].includes(role)) reject('Неизвестная роль', 400);
    if (state.pending) reject('Сначала подтвердите открытую карту');
    if (!context.seats.includes(seat) || state.history.some((entry) => entry.seat === seat)) reject('Место уже занято');
    const reserved = ref.storage === 'club' ? await reservedRolesBySeat(tx, ref.id, context.playerBySeat) : new Map<number, GameRole>();
    if (reserved.has(seat)) reject('На это место уже оформлена покупка роли');
    const protectedCount = [...reserved.values()].filter((reservedRole) => reservedRole === role).length;
    const available = state.deck.filter((entry) => entry.role === role);
    if (!available.length) return reject('Такой роли уже нет в колоде');
    if (available.length <= protectedCount) return reject('Роль недоступна для покупки в текущей раздаче');
    const card = available[0];
    const purchase: Purchase = { playerId: context.playerBySeat.get(seat) || null, amountRub: ROLE_PURCHASE_PRICE_RUB };
    state.history.push({ seat, cardId: card.id, role, previousDeck: state.deck, purchase });
    state.deck = state.deck.filter((entry) => entry.id !== card.id);
    state.version += 1;
    await writeState(tx, ref, state);
    return { ...visible(state), priceRub: ROLE_PURCHASE_PRICE_RUB };
  });
}

async function undoVirtualRoleInner(db: DatabaseWrapper, game: DealGame, version: number) {
  const ref = toRef(game);
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, ref);
    const state = await readState(tx, ref, context);
    versionMatches(state, version);
    if (state.pending) reject('Сначала подтвердите открытую карту');
    const last = state.history.pop();
    if (!last) return reject('Нет выданных карт');
    // A pre-paid reservation must survive undo: the role stays purchased and
    // reserved for the same buyer until a fresh, correct draw is confirmed.
    if (last.purchase?.playerId && ref.storage === 'club') {
      await tx.run(
        `UPDATE game_role_reservations SET status='reserved', updated_at=?
          WHERE game_id=? AND player_id=? AND status='fulfilled'`,
        [new Date().toISOString(), ref.id, last.purchase.playerId],
      ).catch((error) => {
        if (!String(error).includes('no such table')) throw error;
      });
    }
    state.deck = last.previousDeck;
    state.version += 1;
    await writeState(tx, ref, state);
    return visible(state);
  });
}

async function resetVirtualRoleDealInner(db: DatabaseWrapper, game: DealGame, version: number) {
  const ref = toRef(game);
  await ensureVirtualRoleDealSchema(db);
  return db.transaction(async (tx) => {
    const context = await gameContext(tx, ref);
    const { seats } = context;
    const state = await readState(tx, ref, context);
    versionMatches(state, version);
    // A redeal does not silently delete paid reservations or their debts.
    // Only an organizer's explicit order cancellation reverses a purchase.
    if (ref.storage === 'club') await tx.run(
      `UPDATE game_role_reservations SET status='reserved', updated_at=?
       WHERE game_id=? AND status='fulfilled'`,
      [new Date().toISOString(), ref.id],
    ).catch((error) => {
      if (!String(error).includes('no such table')) throw error;
    });
    state.deck = shuffledDeck(seats.length);
    state.history = [];
    state.pending = null;
    state.version += 1;
    await writeState(tx, ref, state);
    return visible(state);
  });
}

/** A bought role is part of the evening's debt: after every change of the deal the evening's payments are recomputed. */
const syncEveningPayments = async (db: DatabaseWrapper, deal: DealGame) => {
  const ref = toRef(deal);
  if (ref.storage !== 'club') return; // a tournament game has no evening payments
  try {
    const game = await db.get<{ evening_id: string }>('SELECT evening_id FROM games WHERE id = ? LIMIT 1', [ref.id]);
    if (game?.evening_id) {
      await reconcileRegularEveningPayments(db, String(game.evening_id));
      await reconcileOtherFormatExtensions(db, String(game.evening_id));
    }
  } catch (error) { console.error('role purchase payment sync failed', error); }
};
export async function buyVirtualRole(db: DatabaseWrapper, game: DealGame, seat: number, role: GameRole, version: number) {
  const result = await buyVirtualRoleInner(db, game, seat, role, version);
  await syncEveningPayments(db, game);
  return result;
}
export async function undoVirtualRole(db: DatabaseWrapper, game: DealGame, version: number) {
  const result = await undoVirtualRoleInner(db, game, version);
  await syncEveningPayments(db, game);
  return result;
}
export async function resetVirtualRoleDeal(db: DatabaseWrapper, game: DealGame, version: number) {
  const result = await resetVirtualRoleDealInner(db, game, version);
  await syncEveningPayments(db, game);
  return result;
}
