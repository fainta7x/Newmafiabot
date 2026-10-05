import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { chooseStrongBotAction, createOpponentMemory, observePokerHand, withOpponentMemory, type OpponentMemory } from './pokerBot.ts';
import { type PokerCard, advancePokerAnimation, applyPokerAction, createPokerHand, foldOutOfTurn, minRaiseTotal, POKER_DEAL_CARD_MS, POKER_DEAL_SETTLE_MS, pokerHandLabel, pokerTurnRemaining, refreshPokerReserve, type PokerState } from './pokerEngine.ts';

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
/** A finished hand in the compact form kept in the database: what the bots need to learn the players' habits. */
export type StoredPokerHand = {
  id: string; at: number; small_blind: number; big_blind: number; board: PokerCard[];
  players: Array<{ id: string; seat: number; net: number; cards: PokerCard[] }>;
  /** [street, player id, action, amount] */
  actions: Array<[string, string, string, number]>;
};
export type PokerRuntimeState = { lobbies: Map<string, PokerLobby>; bankrolls: Map<string, number>; handLog: StoredPokerHand[]; /** What the bots learned about the players of this database only. */ memory?: OpponentMemory; /** When each person at a table last asked for it (memory only: a poll must not rewrite the saved snapshot). */ seen?: Map<string, number> };

const defaultRuntime: PokerRuntimeState = { lobbies: new Map(), bankrolls: new Map(), handLog: [], seen: new Map() };
const runtimeStorage = new AsyncLocalStorage<PokerRuntimeState>();
const runtime = () => runtimeStorage.getStore() || defaultRuntime;
const lobbyStore = () => runtime().lobbies;

export const createPokerRuntimeState = (snapshot?: PokerRuntimeSnapshot): PokerRuntimeState => ({
  lobbies: new Map((snapshot?.lobbies || []).map((lobby) => {
    if (lobby.hand && !lobby.hand.animation_phase) {
      lobby.hand.animation_phase = 'playing'; lobby.hand.animation_step = 0; lobby.hand.animation_next_at = null; lobby.hand.pending_current_seat = null; lobby.hand.animations_enabled = false;
    }
    return [lobby.id, lobby];
  })),
  bankrolls: new Map(Object.entries(snapshot?.bankrolls || {}).map(([id, chips]) => [id, Math.max(0, Math.floor(Number(chips) || 0))])),
  handLog: [],
  memory: createOpponentMemory(),
  seen: new Map(),
});
export const withPokerRuntimeState = <T>(state: PokerRuntimeState, callback: () => T | Promise<T>) => runtimeStorage.run(
  state,
  () => (state.memory ? withOpponentMemory(state.memory, callback) : callback()),
);
export const resetDefaultPokerRuntimeForTesting = () => { defaultRuntime.lobbies.clear(); defaultRuntime.bankrolls.clear(); defaultRuntime.handLog.length = 0; defaultRuntime.seen?.clear(); };
/** Hands finished since the last call; the persistence layer writes them to the database. */
export const pendingPokerHandLog = (): StoredPokerHand[] => runtime().handLog.slice();
/** Drops the first `count` pending hands once they are safely stored; hands of a failed write stay queued for the next request. */
export const confirmPokerHandLog = (count: number) => { runtime().handLog.splice(0, count); };

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
  // Hands among bots only teach nothing about people: keep the ones a person played.
  if (hand.players.some((player) => !player.is_bot)) {
    runtime().handLog.push({
      id: hand.id,
      at: hand.finished_at || Date.now(),
      small_blind: hand.small_blind,
      big_blind: hand.big_blind,
      board: hand.board.slice(),
      players: hand.players.map((player) => ({
        id: player.id,
        seat: player.seat,
        net: player.chips - (player.start_chips ?? player.chips),
        cards: revealed.has(player.id) ? (hand.hole_cards[player.id] || []).slice() : [],
      })),
      actions: hand.action_log.map((entry) => [entry.street, entry.player_id, entry.type, entry.amount]),
    });
  }
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
  advancePokerAnimation(lobby.hand, now);
  for (const player of lobby.hand.players) refreshPokerReserve(player, now, player.seat !== lobby.hand.current_seat, lobby.hand.max_reserve_seconds);
  const currentPlayer = lobby.hand.players.find((player) => player.seat === lobby.hand?.current_seat);
  const viewer = viewerId ? lobby.hand.players.find((player) => player.id === viewerId) : null;
  const isViewerTurn = Boolean(lobby.hand.animation_phase === 'playing' && viewer && currentPlayer?.id === viewer.id);
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
  const orderedDeal = lobby.hand.players.slice().sort((a, b) => a.seat - b.seat);
  const dealElapsed = lobby.hand.animation_phase === 'dealing' && lobby.hand.animation_next_at
    ? Math.max(0, orderedDeal.length * 2 * POKER_DEAL_CARD_MS - (lobby.hand.animation_next_at - POKER_DEAL_SETTLE_MS - now)) : orderedDeal.length * 2 * POKER_DEAL_CARD_MS;
  const dealtCardCount = lobby.hand.animation_phase === 'dealing' ? Math.min(orderedDeal.length * 2, Math.floor(dealElapsed / POKER_DEAL_CARD_MS)) : orderedDeal.length * 2;
  const visibleHoleCards = (id: string) => {
    const index = orderedDeal.findIndex((player) => player.id === id);
    if (index < 0) return [];
    const count = Number(dealtCardCount > index) + Number(dealtCardCount > index + orderedDeal.length);
    return (lobby.hand?.hole_cards[id] || []).slice(0, count);
  };
  const holeCards = Object.fromEntries([...visibleIds].map((id) => [id, visibleHoleCards(id)]));
  // A player who sat down during a hand watches it and plays from the next one.
  const viewerAtTable = Boolean(viewerId && lobby.players.some((player) => player.id === viewerId));
  const viewerSeated = viewerAtTable;
  const showdownLabels = lobby.hand.street === 'finished' ? Object.fromEntries((lobby.hand.revealed_ids || []).map((id) => [id, pokerHandLabel(lobby.hand!, id)])) : {};
  const hand = { ...lobby.hand, deck: [], burn_cards: [], dealt_card_count: dealtCardCount, showdown_labels: showdownLabels, viewer_id: viewerSeated ? viewerId : null, waiting_for_next_hand: viewerAtTable && !viewer, next_hand_in: lobby.status === 'playing' && lobby.hand.finished_at ? Math.max(0, Math.ceil((lobby.hand.finished_at + NEXT_HAND_DELAY_MS - Date.now()) / 1000)) : null, hole_cards: holeCards, hand_label: viewerId ? pokerHandLabel(lobby.hand, viewerId) : null, turn_remaining: currentPlayer ? pokerTurnRemaining(lobby.hand, currentPlayer) : null, is_viewer_turn: isViewerTurn, available_actions: availableActions };
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
  if (!lobby.hand) { lobby.hand = createPokerHand({ id: randomUUID(), players: ready.sort((a, b) => a.seat - b.seat), animate: true }); lobby.status = 'playing'; return; }
  // A finished hand waits its usual pause before the next deal (see tickPokerLobby).
  if (lobby.status === 'waiting') nextPokerHand(lobby);
};

export const listPokerLobbies = (viewerId?: string) => { ensureMainLobby(); return [...lobbyStore().values()].filter((lobby) => lobby.status !== 'finished' && (lobby.players.length < 8 || lobby.permanent || lobby.players.some((player) => player.is_bot) || (Boolean(viewerId) && lobby.players.some((player) => player.id === viewerId)))).map((lobby) => ({ id: lobby.id, title: lobby.title, ownerId: lobby.ownerId, status: lobby.status, permanent: Boolean(lobby.permanent), full: lobby.players.length >= 8 && !lobby.players.some((player) => player.is_bot), players: lobby.players.map(({ id, nickname, seat, is_bot }) => ({ id, nickname, seat, is_bot: Boolean(is_bot) })), joined: Boolean(viewerId) && lobby.players.some((player) => player.id === viewerId), createdAt: lobby.createdAt }))
  .sort((a, b) => Number(b.permanent) - Number(a.permanent)); };

/**
 * A person who is completely AFK for POKER_AFK_LEAVE_MS (owner, 2026-10-05: «кикать полностью АФК, кто больше 5 минут») is
 * taken off his table. Two kinds: he stopped asking for the table (closed the app, left the screen, lost the connection), or he
 * is away («Отойти» / his turn timed out) and stays away. The seats of people who walked off used to stay for ever, so the
 * shared table read 8/8 and still showed them. Leaving folds his cards in a running hand and keeps his chips in the bankroll,
 * like pressing «Выйти».
 */
export const POKER_AFK_LEAVE_MS = 5 * 60 * 1000;
const seenKey = (lobbyId: string, playerId: string) => `${lobbyId}:${playerId}`;
const awayKey = (lobbyId: string, playerId: string) => `away:${lobbyId}:${playerId}`;
export const touchPokerSeat = (lobby: PokerLobby, playerId: string, now = Date.now()) => {
  if (lobby.players.some((player) => player.id === playerId)) runtime().seen?.set(seenKey(lobby.id, playerId), now);
};
export const removeIdlePokerSeats = (lobby: PokerLobby, now = Date.now()) => {
  const seen = runtime().seen;
  if (!seen) return 0;
  let removed = 0;
  for (const seat of [...lobby.players]) {
    if (seat.is_bot) continue;
    const key = seenKey(lobby.id, seat.id);
    const last = seen.get(key);
    // After a restart nobody has been heard yet: the clock starts now instead of kicking everybody at once.
    if (last === undefined) seen.set(key, now);
    let afk = last !== undefined && now - last > POKER_AFK_LEAVE_MS;
    // A person who is away is counted from the moment he went away, even if his screen is still open.
    if (seat.sitting_out) {
      const since = seen.get(awayKey(lobby.id, seat.id)) ?? now;
      seen.set(awayKey(lobby.id, seat.id), since);
      if (now - since > POKER_AFK_LEAVE_MS) afk = true;
    } else seen.delete(awayKey(lobby.id, seat.id));
    if (afk) { seen.delete(key); seen.delete(awayKey(lobby.id, seat.id)); leavePokerLobby(lobby, seat.id); removed += 1; }
  }
  return removed;
};
export const sweepIdlePokerSeats = (now = Date.now()) => {
  let removed = 0;
  for (const lobby of [...lobbyStore().values()]) removed += removeIdlePokerSeats(lobby, now);
  return removed;
};
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
  if (lobby.players.some((item) => item.id === player.id)) { touchPokerSeat(lobby, player.id); return lobby; }
  if (otherTableFor(player.id, lobby.id)) throw new Error('Вы уже сидите за другим столом. Сначала выйдите из него.');
  if (lobby.players.length >= 8) {
    // A person comes before a bot: a table full of bots that somebody left running must not lock people out, so the bot
    // with the smallest stack gives up its seat (its cards are folded, chips already in the pot stay there).
    const weakestBot = lobby.players.filter((item) => item.is_bot)
      .sort((a, b) => effectiveStack(lobby, a.id) - effectiveStack(lobby, b.id) || b.seat - a.seat)[0];
    if (!weakestBot) throw new Error('За столом максимум 8 игроков.');
    leavePokerLobby(lobby, weakestBot.id);
  }
  lobby.players.push({ ...player, seat: freeSeat(lobby), chips: runtime().bankrolls.get(player.id) ?? POKER_REBUY_CHIPS });
  touchPokerSeat(lobby, player.id);
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
/**
 * A bot that has lost all its chips leaves the table (owner, 2026-10-05): bots never rebuy, so a busted bot would
 * keep its seat for ever — a person who trained with a full table of bots and walked away left nobody able to sit down.
 * The finished hand still holds the real stacks (the seat is updated at the next deal), so it decides who is busted;
 * the hand itself keeps the bot for the result screen.
 */
export const removeBustedPokerBots = (lobby: PokerLobby) => {
  const bustedIds = new Set<string>();
  for (const seat of lobby.players) {
    if (!seat.is_bot) continue;
    const handPlayer = lobby.hand?.players.find((player) => player.id === seat.id);
    const stack = lobby.hand?.street === 'finished' && handPlayer ? handPlayer.chips : seat.chips;
    if (stack <= 0) bustedIds.add(seat.id);
  }
  if (!bustedIds.size) return 0;
  lobby.players = lobby.players.filter((player) => !bustedIds.has(player.id));
  return bustedIds.size;
};

export const addPokerBot = (lobby: PokerLobby) => {
  if (lobby.status === 'finished') throw new Error('Игра за этим столом закончилась.');
  if (lobby.players.length >= 8) throw new Error('За столом максимум 8 игроков.');
  const name = BOT_NAMES.find((candidate) => !lobby.players.some((item) => item.nickname === candidate)) || `Бот ${lobby.players.length}`;
  lobby.players.push({ id: `bot-${randomUUID()}`, nickname: name, seat: freeSeat(lobby), chips: 1000, is_bot: true });
  autoDealMainLobby(lobby);
  return lobby;
};
export const startPokerLobby = (lobby: PokerLobby, actorId: string, animate = false) => {
  if (lobby.ownerId !== actorId) throw new Error('Запустить игру может создатель лобби.');
  const ready = lobby.players.filter((player) => player.chips > 0 && !player.sitting_out);
  if (ready.length < 2) throw new Error('Нужно минимум 2 игрока.');
  lobby.hand = createPokerHand({ id: randomUUID(), players: ready, animate }); lobby.status = 'playing'; return lobby;
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
  removeBustedPokerBots(lobby);
  // Players who are away keep their seat and chips but are not dealt in, like «sit out» in poker rooms.
  const seated = lobby.players.filter((player) => player.chips > 0 && !player.sitting_out).sort((a, b) => a.seat - b.seat).map((player) => {
    const handPlayer = hand.players.find((item) => item.id === player.id);
    return { ...player, reserve_seconds: handPlayer?.reserve_seconds, reserve_recovery_at: handPlayer?.reserve_recovery_at };
  });
  if (seated.length < 2) { lobby.status = 'waiting'; return lobby; }
  lobby.status = 'playing';
  const dealer = seated.find((player) => player.seat > hand.dealer_seat) || seated[0];
  lobby.hand = createPokerHand({ id: randomUUID(), players: seated, dealer_seat: dealer.seat, animate: hand.animations_enabled });
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
  removeIdlePokerSeats(lobby);
  if (lobby.permanent && !lobby.hand) autoDealMainLobby(lobby);
  if (!lobby.hand || lobby.status === 'finished') return;
  const now = Date.now();
  advancePokerAnimation(lobby.hand, now);
  for (const player of lobby.hand.players) refreshPokerReserve(player, now, player.seat !== lobby.hand.current_seat, lobby.hand.max_reserve_seconds);
  if (lobby.hand.street === 'finished') {
    recordFinishedHand(lobby);
    // The seat is freed as soon as the hand ends, not after the pause before the next deal.
    removeBustedPokerBots(lobby);
    if (lobby.hand.finished_at && Date.now() - lobby.hand.finished_at >= NEXT_HAND_DELAY_MS) nextPokerHand(lobby);
    return;
  }
  if (lobby.hand.animation_phase !== 'playing') return;
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
