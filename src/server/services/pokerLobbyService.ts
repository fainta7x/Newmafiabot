import { randomUUID } from 'node:crypto';
import { applyPokerAction, createPokerHand, minRaiseTotal, pokerHandLabel, pokerTurnRemaining, type PokerState } from './pokerEngine.ts';

export type PokerLobby = { id: string; title: string; ownerId: string; status: 'waiting' | 'playing' | 'finished'; players: Array<{ id: string; nickname: string; seat: number; chips: number; is_bot?: boolean }>; hand: PokerState | null; createdAt: string };
const lobbies = new Map<string, PokerLobby>();
/** Like real poker rooms: the result stays on screen for a moment, then the next hand is dealt by itself. */
export const NEXT_HAND_DELAY_MS = 6000;
/** Test bots fill the table up to 8 seats; they wait a moment so people can follow the play. */
const BOT_NAMES = ['Бот Лаки', 'Бот Блеф', 'Бот Скала', 'Бот Акула', 'Бот Профи', 'Бот Ниндзя', 'Бот Фортуна'];
export const BOT_THINK_MS = 1200;

/** A simple test opponent: checks or calls most of the time, sometimes raises, gives up against big bets. */
export const chooseBotAction = (hand: PokerState, bot: { chips: number; committed: number }, random = Math.random) => {
  const toCall = Math.max(0, hand.current_bet - bot.committed);
  const roll = random();
  if (toCall === 0) return roll < 0.2 && bot.chips > hand.big_blind * 2 ? { type: 'bet' as const, amount: minRaiseTotal(hand) + hand.big_blind } : { type: 'check' as const };
  if (toCall > bot.chips * 0.5 && roll < 0.5) return { type: 'fold' as const };
  if (roll < 0.1 && bot.chips > toCall + hand.big_blind * 2) return { type: 'bet' as const, amount: minRaiseTotal(hand) };
  return { type: 'call' as const };
};

const publicState = (lobby: PokerLobby, viewerId?: string) => {
  if (!lobby.hand) return { ...lobby, hand: null };
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
  const viewerSeated = Boolean(viewer);
  const showdownLabels = lobby.hand.street === 'finished' ? Object.fromEntries((lobby.hand.revealed_ids || []).map((id) => [id, pokerHandLabel(lobby.hand!, id)])) : {};
  const hand = { ...lobby.hand, deck: [], burn_cards: [], showdown_labels: showdownLabels, viewer_id: viewerSeated ? viewerId : null, next_hand_in: lobby.status === 'playing' && lobby.hand.finished_at ? Math.max(0, Math.ceil((lobby.hand.finished_at + NEXT_HAND_DELAY_MS - Date.now()) / 1000)) : null, hole_cards: holeCards, hand_label: viewerId ? pokerHandLabel(lobby.hand, viewerId) : null, turn_remaining: currentPlayer ? pokerTurnRemaining(lobby.hand, currentPlayer) : null, is_viewer_turn: isViewerTurn, available_actions: availableActions };
  return { ...lobby, hand };
};

export const listPokerLobbies = () => [...lobbies.values()].filter((lobby) => lobby.status === 'waiting').map((lobby) => ({ id: lobby.id, title: lobby.title, ownerId: lobby.ownerId, status: lobby.status, players: lobby.players.map(({ id, nickname, seat }) => ({ id, nickname, seat })), createdAt: lobby.createdAt }));
export const createPokerLobby = (owner: { id: string; nickname: string }, title = 'Открытая покерная комната') => {
  const lobby: PokerLobby = { id: randomUUID(), title: title.trim().slice(0, 80) || 'Открытая покерная комната', ownerId: owner.id, status: 'waiting', players: [{ ...owner, seat: 1, chips: 1000 }], hand: null, createdAt: new Date().toISOString() };
  lobbies.set(lobby.id, lobby); return lobby;
};
export const getPokerLobby = (id: string) => lobbies.get(id) || null;
export const joinPokerLobby = (lobby: PokerLobby, player: { id: string; nickname: string }) => {
  if (lobby.status !== 'waiting') throw new Error('Игра уже началась.');
  if (lobby.players.some((item) => item.id === player.id)) return lobby;
  if (lobby.players.length >= 8) throw new Error('В лобби максимум 8 игроков.');
  lobby.players.push({ ...player, seat: lobby.players.length + 1, chips: 1000 }); return lobby;
};
export const addPokerBot = (lobby: PokerLobby) => {
  if (lobby.status !== 'waiting') throw new Error('Игра уже началась.');
  if (lobby.players.length >= 8) throw new Error('В лобби максимум 8 игроков.');
  const name = BOT_NAMES.find((candidate) => !lobby.players.some((item) => item.nickname === candidate)) || `Бот ${lobby.players.length}`;
  lobby.players.push({ id: `bot-${randomUUID()}`, nickname: name, seat: lobby.players.length + 1, chips: 1000, is_bot: true });
  return lobby;
};
export const startPokerLobby = (lobby: PokerLobby, actorId: string) => {
  if (lobby.ownerId !== actorId) throw new Error('Запустить игру может создатель лобби.');
  if (lobby.players.length < 2) throw new Error('Нужно минимум 2 игрока.');
  lobby.hand = createPokerHand({ id: randomUUID(), players: lobby.players }); lobby.status = 'playing'; return lobby;
};
/** Deals the next hand with the chips left; the dealer button moves on. Busted players sit out. */
export const nextPokerHand = (lobby: PokerLobby) => {
  const hand = lobby.hand;
  if (!hand || lobby.status !== 'playing') throw new Error('Игра не идёт.');
  if (hand.street !== 'finished') throw new Error('Текущая раздача ещё не закончилась.');
  for (const player of lobby.players) {
    const handPlayer = hand.players.find((item) => item.id === player.id);
    if (handPlayer) player.chips = handPlayer.chips;
  }
  const seated = lobby.players.filter((player) => player.chips > 0).sort((a, b) => a.seat - b.seat);
  if (seated.length < 2) { lobby.status = 'finished'; return lobby; }
  const dealer = seated.find((player) => player.seat > hand.dealer_seat) || seated[0];
  lobby.hand = createPokerHand({ id: randomUUID(), players: seated, dealer_seat: dealer.seat });
  return lobby;
};
export const publicPokerLobby = (lobby: PokerLobby, viewerId?: string) => publicState(lobby, viewerId);
export const tickPokerLobby = (lobby: PokerLobby) => {
  if (!lobby.hand || lobby.status !== 'playing') return;
  if (lobby.hand.street === 'finished') {
    if (lobby.hand.finished_at && Date.now() - lobby.hand.finished_at >= NEXT_HAND_DELAY_MS) nextPokerHand(lobby);
    return;
  }
  if (lobby.hand.current_seat === null) return;
  const player = lobby.hand.players.find((item) => item.seat === lobby.hand?.current_seat);
  if (!player) return;
  if (player.is_bot) {
    if (lobby.hand.turn_started_at && Date.now() - lobby.hand.turn_started_at < BOT_THINK_MS) return;
    try { applyPokerAction(lobby.hand, chooseBotAction(lobby.hand, player)); } catch { try { applyPokerAction(lobby.hand, { type: 'call' }); } catch { /* retry on next poll */ } }
    return;
  }
  const remaining = pokerTurnRemaining(lobby.hand, player);
  if (remaining.base_seconds > 0 || remaining.reserve_seconds > 0) return;
  const toCall = Math.max(0, lobby.hand.current_bet - player.committed);
  try { applyPokerAction(lobby.hand, { type: toCall ? 'fold' : 'check' }); } catch { /* retry on next poll */ }
};
