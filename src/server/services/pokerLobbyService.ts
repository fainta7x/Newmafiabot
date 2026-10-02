import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { chooseStrongBotAction, observePokerHand } from './pokerBot.ts';
import { type PokerCard, applyPokerAction, createPokerHand, foldOutOfTurn, minRaiseTotal, pokerHandLabel, pokerTurnRemaining, refreshPokerReserve, type PokerState } from './pokerEngine.ts';

export type PokerHistoryEntry = {
  id: string; number: number; at: number; small_blind: number; big_blind: number; board: PokerCard[]; pot: number;
  winner_ids: string[];
  players: Array<{ id: string; nickname: string; seat: number; cards: PokerCard[]; revealed: boolean; net: number; label: string | null }>;
  actions: Array<{ street: string; player_id: string; player_name: string; type: string; amount: number }>;
};
export type PokerLobby = { id: string; title: string; ownerId: string; status: 'waiting' | 'playing' | 'finished'; players: Array<{ id: string; nickname: string; seat: number; chips: number; is_bot?: boolean; sitting_out?: boolean }>; hand: PokerState | null; createdAt: string;
  /** The last finished hands, newest first, so a player can see how a hand went. */
  history?: PokerHistoryEntry[];
  /** The always-open «Общий стол» (owner, 2026-10-02): never closes, deals by itself from two players. */
  permanent?: boolean };
export type PokerRuntimeSnapshot = { version: 1; lobbies: PokerLobby[]; bankrolls: Record<string, number> };
export type PokerRuntimeState = { lobbies: Map<string, PokerLobby>; bankrolls: Map<string, number> };

const defaultRuntime: PokerRuntimeState = { lobbies: new Map(), bankrolls: new Map() };
const runtimeStorage = new AsyncLocalStorage<PokerRuntimeState>();
const runtime = () => runtimeStorage.getStore() || defaultRuntime;
const lobbyStore = () => runtime().lobbies;

export const createPokerRuntimeState = (snapshot?: PokerRuntimeSnapshot): PokerRuntimeState => ({
  lobbies: new Map((snapshot?.lobbies || []).map((lobby) => [lobby.id, lobby])),
  bankrolls: new Map(Object.entries(snapshot?.bankrolls || {}).map(([id, chips]) => [id, Math.max(0, Math.floor(Number(chips) || 0))])),
});
export const withPokerRuntimeState = <T>(state: PokerRuntimeState, callback: () => T | Promise<T>) => runtimeStorage.run(state, callback);
export const resetDefaultPokerRuntimeForTesting = () => { defaultRuntime.lobbies.clear(); defaultRuntime.bankrolls.clear(); };

const effectiveStack = (lobby: PokerLobby, playerId: string) => {
  const seat = lobby.players.find((player) => player.id === playerId);
  const handPlayer = lobby.hand?.players.find((player) => player.id === playerId);
  return Math.max(0, Math.floor(Number(handPlayer?.chips ?? seat?.chips ?? 0) || 0));
};
const rememberHumanStacks = () => {
  for (const lobby of lobbyStore().values()) for (const player of lobby.players) {
    if (!player.is_bot) runtime().bankrolls.set(player.id, effectiveStack(lobby, player.id));
  }
};
export const exportPokerRuntimeSnapshot = (): PokerRuntimeSnapshot => {
  rememberHumanStacks();
  return { version: 1, lobbies: [...lobbyStore().values()], bankrolls: Object.fromEntries(runtime().bankrolls) };
};
/** Like real poker rooms: the result stays on screen for a moment, then the next hand is dealt by itself. */
export const NEXT_HAND_DELAY_MS = 4000;
/** Test bots fill the table up to 8 seats; they wait a moment so people can follow the play. */
const BOT_NAMES = ['Бот Лаки', 'Бот Блеф', 'Бот Скала', 'Бот Акула', 'Бот Профи', 'Бот Ниндзя', 'Бот Фортуна'];
export const BOT_THINK_MS = 1200;
export const POKER_HISTORY_SIZE = 20;
/** Rebuy for play chips (not club tokens): a busted player takes a new stack and plays on. */
export const POKER_REBUY_CHIPS = 1000;

/** Saves a finished hand once: for the history and for the bots to learn the players' habits. */
const recordFinishedHand = (lobby: PokerLobby) => {
  const hand = lobby.hand;
  if (!hand || hand.street !== 'finished') return;
  lobby.history = lobby.history || [];
  if (lobby.history.some((entry) => entry.id === hand.id)) return;
  observePokerHand(hand);
  const revealed = new Set(hand.revealed_ids || []);
  lobby.history.unshift({
    id: hand.id,
    number: (lobby.history[0]?.number || 0) + 1,
    at: hand.finished_at || Date.now(),
    small_blind: hand.small_blind,
    big_blind: hand.big_blind,
    board: hand.board.slice(),
    pot: hand.last_pot_awarded,
    winner_ids: hand.winner_ids.slice(),
    players: hand.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      seat: player.seat,
      cards: (hand.hole_cards[player.id] || []).slice(),
      revealed: revealed.has(player.id),
      net: player.chips - (player.start_chips ?? player.chips),
      label: revealed.has(player.id) ? pokerHandLabel(hand, player.id) : null,
    })),
    actions: hand.action_log.map((entry) => ({ street: entry.street, player_id: entry.player_id, player_name: entry.player_name, type: entry.type, amount: entry.amount })),
  });
  lobby.history = lobby.history.slice(0, POKER_HISTORY_SIZE);
};

/** What one viewer may see of the history: own cards always, other cards only if shown at a showdown. */
export const publicPokerHistory = (lobby: PokerLobby, viewerId: string) => (lobby.history || []).map((entry) => ({
  ...entry,
  players: entry.players.map((player) => ({ ...player, cards: player.revealed || player.id === viewerId ? player.cards : [] })),
}));

export const rebuyPoker = (lobby: PokerLobby, playerId: string) => {
  const seat = lobby.players.find((player) => player.id === playerId);
  if (!seat) throw new Error('Вы не сидите за этим столом.');
  const handPlayer = lobby.hand?.players.find((player) => player.id === playerId);
  const inLiveHand = Boolean(lobby.hand && lobby.hand.street !== 'finished' && handPlayer && !handPlayer.folded);
  // After a hand ends the seat is updated only at the next deal: the finished hand holds the real stack.
  const stack = lobby.hand?.street === 'finished' && handPlayer ? handPlayer.chips : seat.chips;
  if (stack > 0 || inLiveHand) throw new Error('Взять фишки можно, когда стек закончился.');
  seat.chips = POKER_REBUY_CHIPS;
  // The finished hand still holds the old stack; the next deal copies chips from it.
  if (handPlayer && lobby.hand?.street === 'finished') handPlayer.chips = POKER_REBUY_CHIPS;
  if (lobby.status === 'waiting' && lobby.hand?.street === 'finished') nextPokerHand(lobby);
  return lobby;
};

const publicState = (fullLobby: PokerLobby, viewerId?: string) => {
  // The history holds every player's cards: it is served only through publicPokerHistory.
  const { history: _history, ...lobby } = fullLobby;
  // The viewer's id lets the waiting table seat them at the bottom like during play.
  if (!lobby.hand) return { ...lobby, hand: null, viewer_id: viewerId && lobby.players.some((player) => player.id === viewerId) ? viewerId : null };
  const now = Date.now();
  for (const player of lobby.hand.players) refreshPokerReserve(player, now, player.seat !== lobby.hand.current_seat, lobby.hand.max_reserve_seconds);
  const currentPlayer = lobby.hand.players.find((player) => player.seat === lobby.hand?.current_seat);
  const viewer = viewerId ? lobby.hand.players.find((player) => player.id === viewerId) : null;
  const isViewerTurn = Boolean(viewer && currentPlayer?.id === viewer.id);
  const toCall = viewer ? Math.max(0, lobby.hand.current_bet - viewer.committed) : 0;
  const availableActions = viewer ? {
    can_fold: isViewerTurn,
    can_check: isViewerTurn && toCall === 0,
    can_call: isViewerTurn && toCall > 0 && viewer.chips > 0,
    can_bet: isViewerTurn && viewer.chips > toCall,
    to_call: toCall,
    call_amount: Math.min(toCall, viewer.chips),
    min_bet_total: Math.min(viewer.committed + viewer.chips, minRaiseTotal(lobby.hand)),
    max_bet_total: viewer.committed + viewer.chips,
  } : null;
  // Own cards always; other players' cards only after a showdown. Burned cards stay hidden.
  const visibleIds = new Set([...(viewerId ? [viewerId] : []), ...(lobby.hand.street === 'finished' ? lobby.hand.revealed_ids || [] : [])]);
  const holeCards = Object.fromEntries([...visibleIds].map((id) => [id, lobby.hand?.hole_cards[id] || []]));
  // A player who sat down during a hand watches it and plays from the next one.
  const viewerAtTable = Boolean(viewerId && lobby.players.some((player) => player.id === viewerId));
  const viewerSeated = viewerAtTable;
  const showdownLabels = lobby.hand.street === 'finished' ? Object.fromEntries((lobby.hand.revealed_ids || []).map((id) => [id, pokerHandLabel(lobby.hand!, id)])) : {};
  const hand = { ...lobby.hand, deck: [], burn_cards: [], showdown_labels: showdownLabels, viewer_id: viewerSeated ? viewerId : null, waiting_for_next_hand: viewerAtTable && !viewer, next_hand_in: lobby.status === 'playing' && lobby.hand.finished_at ? Math.max(0, Math.ceil((lobby.hand.finished_at + NEXT_HAND_DELAY_MS - Date.now()) / 1000)) : null, hole_cards: holeCards, hand_label: viewerId ? pokerHandLabel(lobby.hand, viewerId) : null, turn_remaining: currentPlayer ? pokerTurnRemaining(lobby.hand, currentPlayer) : null, is_viewer_turn: isViewerTurn, available_actions: availableActions };
  return { ...lobby, hand };
};

export const MAIN_POKER_LOBBY_ID = 'main';
const ensureMainLobby = () => {
  if (!lobbyStore().has(MAIN_POKER_LOBBY_ID)) {
    lobbyStore().set(MAIN_POKER_LOBBY_ID, { id: MAIN_POKER_LOBBY_ID, title: 'Общий стол', ownerId: '', status: 'waiting', players: [], hand: null, createdAt: new Date().toISOString(), permanent: true });
  }
  return lobbyStore().get(MAIN_POKER_LOBBY_ID)!;
};
/** The permanent table deals a hand by itself whenever two players with chips sit at it. */
const autoDealMainLobby = (lobby: PokerLobby) => {
  if (!lobby.permanent || lobby.status === 'finished') return;
  if (lobby.hand && lobby.hand.street !== 'finished') return;
  const ready = lobby.players.filter((player) => player.chips > 0 && !player.sitting_out);
  if (ready.length < 2) { lobby.status = 'waiting'; return; }
  if (!lobby.hand) { lobby.hand = createPokerHand({ id: randomUUID(), players: ready.sort((a, b) => a.seat - b.seat) }); lobby.status = 'playing'; return; }
  // A finished hand waits its usual pause before the next deal (see tickPokerLobby).
  if (lobby.status === 'waiting') nextPokerHand(lobby);
};

export const listPokerLobbies = () => { ensureMainLobby(); return [...lobbyStore().values()].filter((lobby) => lobby.status !== 'finished' && (lobby.players.length < 8 || lobby.permanent)).map((lobby) => ({ id: lobby.id, title: lobby.title, ownerId: lobby.ownerId, status: lobby.status, permanent: Boolean(lobby.permanent), full: lobby.players.length >= 8, players: lobby.players.map(({ id, nickname, seat }) => ({ id, nickname, seat })), createdAt: lobby.createdAt }))
  .sort((a, b) => Number(b.permanent) - Number(a.permanent)); };
const otherTableFor = (playerId: string, lobbyId?: string) => [...lobbyStore().values()].find((table) => table.id !== lobbyId && table.players.some((player) => player.id === playerId));
export const createPokerLobby = (owner: { id: string; nickname: string }, title = 'Открытая покерная комната') => {
  if (otherTableFor(owner.id)) throw new Error('Вы уже сидите за другим столом. Сначала выйдите из него.');
  const lobby: PokerLobby = { id: randomUUID(), title: title.trim().slice(0, 80) || 'Открытая покерная комната', ownerId: owner.id, status: 'waiting', players: [{ ...owner, seat: 1, chips: runtime().bankrolls.get(owner.id) ?? POKER_REBUY_CHIPS }], hand: null, createdAt: new Date().toISOString() };
  lobbyStore().set(lobby.id, lobby); return lobby;
};
export const getPokerLobby = (id: string) => (id === MAIN_POKER_LOBBY_ID ? ensureMainLobby() : lobbyStore().get(id) || null);
/** The lowest seat number nobody sits on. */
const freeSeat = (lobby: PokerLobby) => [1, 2, 3, 4, 5, 6, 7, 8].find((seat) => !lobby.players.some((player) => player.seat === seat)) ?? lobby.players.length + 1;

/** Like a poker room: the table stays open; someone who sits down during a hand plays from the next one. */
export const joinPokerLobby = (lobby: PokerLobby, player: { id: string; nickname: string }) => {
  if (lobby.status === 'finished') throw new Error('Игра за этим столом закончилась.');
  if (lobby.players.some((item) => item.id === player.id)) return lobby;
  if (otherTableFor(player.id, lobby.id)) throw new Error('Вы уже сидите за другим столом. Сначала выйдите из него.');
  if (lobby.players.length >= 8) throw new Error('За столом максимум 8 игроков.');
  lobby.players.push({ ...player, seat: freeSeat(lobby), chips: runtime().bankrolls.get(player.id) ?? POKER_REBUY_CHIPS });
  autoDealMainLobby(lobby);
  return lobby;
};

/** Leaving folds the player's cards in a running hand; chips already in the pot stay there. */
export const leavePokerLobby = (lobby: PokerLobby, playerId: string) => {
  const hand = lobby.hand;
  if (hand && hand.street !== 'finished') {
    const handPlayer = hand.players.find((item) => item.id === playerId);
    if (handPlayer && !handPlayer.folded) foldOutOfTurn(hand, playerId);
  }
  const leaving = lobby.players.find((player) => player.id === playerId);
  if (leaving && !leaving.is_bot) runtime().bankrolls.set(playerId, effectiveStack(lobby, playerId));
  lobby.players = lobby.players.filter((player) => player.id !== playerId);
  const humans = lobby.players.filter((player) => !player.is_bot);
  if (!humans.length && lobby.permanent) {
    // The permanent table never closes: it clears the bots and waits for people.
    lobby.players = []; lobby.hand = null; lobby.status = 'waiting'; lobby.history = [];
    return null;
  }
  if (!humans.length) { lobbyStore().delete(lobby.id); return null; }
  if (lobby.ownerId === playerId) lobby.ownerId = humans[0].id;
  if (lobby.status === 'waiting' && lobby.hand === null) return lobby;
  if (lobby.players.filter((player) => player.chips > 0).length < 2 && (!lobby.hand || lobby.hand.street === 'finished')) lobby.status = 'waiting';
  return lobby;
};
export const addPokerBot = (lobby: PokerLobby) => {
  if (lobby.status === 'finished') throw new Error('Игра за этим столом закончилась.');
  if (lobby.players.length >= 8) throw new Error('За столом максимум 8 игроков.');
  const name = BOT_NAMES.find((candidate) => !lobby.players.some((item) => item.nickname === candidate)) || `Бот ${lobby.players.length}`;
  lobby.players.push({ id: `bot-${randomUUID()}`, nickname: name, seat: freeSeat(lobby), chips: 1000, is_bot: true });
  autoDealMainLobby(lobby);
  return lobby;
};
export const startPokerLobby = (lobby: PokerLobby, actorId: string) => {
  if (lobby.ownerId !== actorId) throw new Error('Запустить игру может создатель лобби.');
  const ready = lobby.players.filter((player) => player.chips > 0 && !player.sitting_out);
  if (ready.length < 2) throw new Error('Нужно минимум 2 игрока.');
  lobby.hand = createPokerHand({ id: randomUUID(), players: ready }); lobby.status = 'playing'; return lobby;
};
/** Deals the next hand with the chips left; the dealer button moves on. Busted players sit out. */
export const nextPokerHand = (lobby: PokerLobby) => {
  const hand = lobby.hand;
  if (!hand || lobby.status === 'finished') throw new Error('Игра не идёт.');
  if (hand.street !== 'finished') throw new Error('Текущая раздача ещё не закончилась.');
  recordFinishedHand(lobby);
  for (const player of lobby.players) {
    const handPlayer = hand.players.find((item) => item.id === player.id);
    if (handPlayer) player.chips = handPlayer.chips;
  }
  // Players who are away keep their seat and chips but are not dealt in, like «sit out» in poker rooms.
  const seated = lobby.players.filter((player) => player.chips > 0 && !player.sitting_out).sort((a, b) => a.seat - b.seat);
  if (seated.length < 2) { lobby.status = 'waiting'; return lobby; }
  lobby.status = 'playing';
  const dealer = seated.find((player) => player.seat > hand.dealer_seat) || seated[0];
  lobby.hand = createPokerHand({ id: randomUUID(), players: seated, dealer_seat: dealer.seat });
  return lobby;
};
/** «Отойти» / «Вернуться за стол»: an away player keeps the seat but is not dealt in until they come back. */
export const setPokerSitOut = (lobby: PokerLobby, playerId: string, away: boolean) => {
  const seat = lobby.players.find((player) => player.id === playerId);
  if (!seat) throw new Error('Вы не сидите за этим столом.');
  seat.sitting_out = away;
  // Coming back to a table that waited for players deals the next hand at once.
  if (!away && lobby.status === 'waiting' && lobby.hand?.street === 'finished') nextPokerHand(lobby);
  return lobby;
};
export const publicPokerLobby = (lobby: PokerLobby, viewerId?: string) => publicState(lobby, viewerId);
export const tickPokerLobby = (lobby: PokerLobby) => {
  if (lobby.permanent && !lobby.hand) autoDealMainLobby(lobby);
  if (!lobby.hand || lobby.status === 'finished') return;
  const now = Date.now();
  for (const player of lobby.hand.players) refreshPokerReserve(player, now, player.seat !== lobby.hand.current_seat, lobby.hand.max_reserve_seconds);
  if (lobby.hand.street === 'finished') {
    recordFinishedHand(lobby);
    if (lobby.hand.finished_at && Date.now() - lobby.hand.finished_at >= NEXT_HAND_DELAY_MS) nextPokerHand(lobby);
    return;
  }
  if (lobby.hand.current_seat === null) return;
  const player = lobby.hand.players.find((item) => item.seat === lobby.hand?.current_seat);
  if (!player) return;
  if (player.is_bot) {
    if (lobby.hand.turn_started_at && Date.now() - lobby.hand.turn_started_at < BOT_THINK_MS) return;
    try { applyPokerAction(lobby.hand, chooseStrongBotAction(lobby.hand, player)); } catch { try { applyPokerAction(lobby.hand, { type: 'call' }); } catch { /* retry on next poll */ } }
    return;
  }
  const seat = lobby.players.find((item) => item.id === player.id);
  const remaining = pokerTurnRemaining(lobby.hand, player);
  // A player who is away (or left) is played at once; a player whose time ran out goes away.
  if (!seat?.sitting_out && (remaining.base_seconds > 0 || remaining.reserve_seconds > 0)) return;
  if (seat && !seat.sitting_out) seat.sitting_out = true;
  const toCall = Math.max(0, lobby.hand.current_bet - player.committed);
  try { applyPokerAction(lobby.hand, { type: toCall ? 'fold' : 'check' }); } catch { /* retry on next poll */ }
};
