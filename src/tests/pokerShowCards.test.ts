import { beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction } from '../server/services/pokerEngine.ts';
import {
  createPokerLobby, joinPokerLobby, publicPokerHistory, publicPokerLobby, resetDefaultPokerRuntimeForTesting, showPokerCards, startPokerLobby, tickPokerLobby,
} from '../server/services/pokerLobbyService.ts';

const table = () => {
  const lobby = createPokerLobby({ id: 'alice', nickname: 'Alice' });
  joinPokerLobby(lobby, { id: 'bob', nickname: 'Bob' });
  startPokerLobby(lobby, 'alice');
  return lobby;
};
const finishByFold = (lobby: ReturnType<typeof table>) => {
  applyPokerAction(lobby.hand!, { type: 'fold' });
  tickPokerLobby(lobby);
};
const handOf = (lobby: ReturnType<typeof table>, viewer: string) => publicPokerLobby(lobby, viewer).hand as any;

describe('showing cards after a hand (owner, 2026-10-12)', () => {
  beforeEach(() => resetDefaultPokerRuntimeForTesting());

  it('is not possible during the hand, nor for someone who did not play it', () => {
    const lobby = table();
    expect(() => showPokerCards(lobby, 'alice', [0])).toThrow(/раздача закончилась/);
    finishByFold(lobby);
    expect(lobby.hand!.street).toBe('finished');
    expect(() => showPokerCards(lobby, 'zed', [0])).toThrow(/не участвовали/);
    expect(() => showPokerCards(lobby, 'alice', [])).toThrow(/Выберите/);
    expect(() => showPokerCards(lobby, 'alice', [7])).toThrow(/Выберите/);
  });

  it('shows one chosen card to the others and keeps the second hidden', () => {
    const lobby = table();
    finishByFold(lobby);
    const loser = lobby.hand!.players.find((player) => lobby.hand!.winner_ids.every((id) => id !== player.id))!;
    const other = lobby.hand!.players.find((player) => player.id !== loser.id)!;
    expect(handOf(lobby, other.id).shown_cards).toEqual({});
    showPokerCards(lobby, loser.id, [1]);
    const seen = handOf(lobby, other.id);
    expect(seen.shown_cards[loser.id]).toEqual([null, lobby.hand!.hole_cards[loser.id][1]]);
    expect(seen.hole_cards[loser.id]).toBeUndefined();
    expect(seen.revealed_ids).not.toContain(loser.id);
    // The history keeps the shown card too, the hidden one stays hidden (owner, 2026-10-13).
    const inHistory = publicPokerHistory(lobby, other.id)[0].players.find((item) => item.id === loser.id)!;
    expect(inHistory.cards).toEqual([null, lobby.hand!.hole_cards[loser.id][1]]);
    expect(publicPokerHistory(lobby, other.id)[0].players.find((item) => item.id === other.id)!.cards).toHaveLength(2);
  });

  it('shows the whole hand when both cards are chosen, one at a time or together, like a showdown', () => {
    const lobby = table();
    finishByFold(lobby);
    const player = lobby.hand!.players[0];
    const other = lobby.hand!.players[1];
    showPokerCards(lobby, player.id, [0]);
    showPokerCards(lobby, player.id, [1]);
    const seen = handOf(lobby, other.id);
    expect(seen.hole_cards[player.id]).toEqual(lobby.hand!.hole_cards[player.id]);
    expect(seen.shown_cards[player.id]).toBeUndefined();
    expect(seen.showdown_labels[player.id]).toBeTruthy();
    expect(publicPokerHistory(lobby, other.id)[0].players.find((item) => item.id === player.id)!.cards).toHaveLength(2);
    expect(() => showPokerCards(lobby, player.id, [0])).toThrow(/уже открыты/);
  });

  it('is forgotten with the next hand', () => {
    const lobby = table();
    finishByFold(lobby);
    showPokerCards(lobby, lobby.hand!.players[0].id, [0]);
    lobby.hand!.finished_at = Date.now() - 60_000;
    tickPokerLobby(lobby);
    expect(lobby.hand!.street).not.toBe('finished');
    expect(handOf(lobby, 'alice').shown_cards).toEqual({});
  });
});
