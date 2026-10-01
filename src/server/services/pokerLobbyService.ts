import { randomUUID } from 'node:crypto';
import { applyPokerAction, createPokerHand, pokerHandLabel, pokerTurnRemaining, type PokerState } from './pokerEngine.ts';

export type PokerLobby = { id: string; title: string; ownerId: string; status: 'waiting' | 'playing' | 'finished'; players: Array<{ id: string; nickname: string; seat: number; chips: number; is_bot?: boolean }>; hand: PokerState | null; createdAt: string };
const lobbies = new Map<string, PokerLobby>();

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
    min_bet_total: Math.min(viewer.committed + viewer.chips, Math.max(lobby.hand.big_blind, lobby.hand.current_bet + lobby.hand.big_blind)),
    max_bet_total: viewer.committed + viewer.chips,
  } : null;
  // Own cards always; other players' cards only after a showdown. Burned cards stay hidden.
  const visibleIds = new Set([...(viewerId ? [viewerId] : []), ...(lobby.hand.street === 'finished' ? lobby.hand.revealed_ids || [] : [])]);
  const holeCards = Object.fromEntries([...visibleIds].map((id) => [id, lobby.hand?.hole_cards[id] || []]));
  const viewerSeated = Boolean(viewer);
  const hand = { ...lobby.hand, deck: [], burn_cards: [], viewer_id: viewerSeated ? viewerId : null, can_deal_next: viewerSeated && lobby.status === 'playing' && lobby.hand.street === 'finished', hole_cards: holeCards, hand_label: viewerId ? pokerHandLabel(lobby.hand, viewerId) : null, turn_remaining: currentPlayer ? pokerTurnRemaining(lobby.hand, currentPlayer) : null, is_viewer_turn: isViewerTurn, available_actions: availableActions };
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
  if (lobby.players.some((item) => item.is_bot)) return lobby;
  lobby.players.push({ id: `bot-${randomUUID()}`, nickname: 'Тестовый бот', seat: lobby.players.length + 1, chips: 1000, is_bot: true });
  return lobby;
};
export const startPokerLobby = (lobby: PokerLobby, actorId: string) => {
  if (lobby.ownerId !== actorId) throw new Error('Запустить игру может создатель лобби.');
  if (lobby.players.length < 2) throw new Error('Нужно минимум 2 игрока.');
  lobby.hand = createPokerHand({ id: randomUUID(), players: lobby.players }); lobby.status = 'playing'; return lobby;
};
/** Any seated player starts the next hand once the current one is over; the dealer button moves on. */
export const nextPokerHand = (lobby: PokerLobby, actorId: string) => {
  const hand = lobby.hand;
  if (!hand || lobby.status !== 'playing') throw new Error('Игра не идёт.');
  if (hand.street !== 'finished') throw new Error('Текущая раздача ещё не закончилась.');
  if (!lobby.players.some((player) => player.id === actorId)) throw new Error('Вы не сидите за этим столом.');
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
  if (!lobby.hand || lobby.status !== 'playing' || lobby.hand.current_seat === null) return;
  const player = lobby.hand.players.find((item) => item.seat === lobby.hand?.current_seat);
  if (!player) return;
  if (player.is_bot) {
    const toCall = Math.max(0, lobby.hand.current_bet - player.committed);
    try { applyPokerAction(lobby.hand, { type: toCall ? 'call' : 'check' }); } catch { /* retry on next poll */ }
    return;
  }
  const remaining = pokerTurnRemaining(lobby.hand, player);
  if (remaining.base_seconds > 0 || remaining.reserve_seconds > 0) return;
  const toCall = Math.max(0, lobby.hand.current_bet - player.committed);
  try { applyPokerAction(lobby.hand, { type: toCall ? 'fold' : 'check' }); } catch { /* retry on next poll */ }
};
