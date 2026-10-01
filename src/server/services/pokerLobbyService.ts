import { randomUUID } from 'node:crypto';
import { applyPokerAction, createPokerHand, pokerHandLabel, pokerTurnRemaining, type PokerState } from './pokerEngine.ts';

export type PokerLobby = { id: string; title: string; ownerId: string; status: 'waiting' | 'playing' | 'finished'; players: Array<{ id: string; nickname: string; seat: number; chips: number }>; hand: PokerState | null; createdAt: string };
const lobbies = new Map<string, PokerLobby>();

const publicState = (lobby: PokerLobby, viewerId?: string) => {
  if (!lobby.hand) return { ...lobby, hand: null };
  const currentPlayer = lobby.hand.players.find((player) => player.seat === lobby.hand?.current_seat);
  const hand = { ...lobby.hand, deck: [], hole_cards: viewerId ? { [viewerId]: lobby.hand.hole_cards[viewerId] || [] } : {}, hand_label: viewerId ? pokerHandLabel(lobby.hand, viewerId) : null, turn_remaining: currentPlayer ? pokerTurnRemaining(lobby.hand, currentPlayer) : null };
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
export const startPokerLobby = (lobby: PokerLobby, actorId: string) => {
  if (lobby.ownerId !== actorId) throw new Error('Запустить игру может создатель лобби.');
  if (lobby.players.length < 2) throw new Error('Нужно минимум 2 игрока.');
  lobby.hand = createPokerHand({ id: randomUUID(), players: lobby.players }); lobby.status = 'playing'; return lobby;
};
export const publicPokerLobby = (lobby: PokerLobby, viewerId?: string) => publicState(lobby, viewerId);
export const tickPokerLobby = (lobby: PokerLobby) => {
  if (!lobby.hand || lobby.status !== 'playing' || lobby.hand.current_seat === null) return;
  const player = lobby.hand.players.find((item) => item.seat === lobby.hand?.current_seat);
  if (!player) return;
  const remaining = pokerTurnRemaining(lobby.hand, player);
  if (remaining.base_seconds > 0 || remaining.reserve_seconds > 0) return;
  const toCall = Math.max(0, lobby.hand.current_bet - player.committed);
  try { applyPokerAction(lobby.hand, { type: toCall ? 'fold' : 'check' }); } catch { /* retry on next poll */ }
};
