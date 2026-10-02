import { describe, expect, it } from 'vitest';
import { applyPokerAction } from '../server/services/pokerEngine.ts';
import {
  MAIN_POKER_LOBBY_ID,
  addPokerBot,
  createPokerLobby,
  getPokerLobby,
  joinPokerLobby,
  leavePokerLobby,
  listPokerLobbies,
  publicPokerHistory,
  publicPokerLobby,
  rebuyPoker,
  startPokerLobby,
  tickPokerLobby,
} from '../server/services/pokerLobbyService.ts';

const finishByFolds = (lobby: NonNullable<ReturnType<typeof getPokerLobby>>) => {
  let guard = 0;
  while (lobby.hand && lobby.hand.street !== 'finished' && guard < 20) {
    applyPokerAction(lobby.hand, { type: 'fold' });
    guard += 1;
  }
  tickPokerLobby(lobby);
};

describe('poker table: history, rebuy, permanent table (owner, 2026-10-02)', () => {
  it('keeps finished hands and shows other players\' cards only after a showdown', () => {
    const lobby = createPokerLobby({ id: 'alice', nickname: 'Alice' });
    joinPokerLobby(lobby, { id: 'bob', nickname: 'Bob' });
    startPokerLobby(lobby, 'alice');
    finishByFolds(lobby);

    const forAlice = publicPokerHistory(lobby, 'alice');
    expect(forAlice).toHaveLength(1);
    const entry = forAlice[0];
    expect(entry.number).toBe(1);
    expect(entry.players.find((player) => player.id === 'alice')!.cards).toHaveLength(2);
    expect(entry.players.find((player) => player.id === 'bob')!.cards).toHaveLength(0);
    expect(entry.players.reduce((sum, player) => sum + player.net, 0)).toBe(0);
    expect(entry.actions.some((action) => action.type === 'fold')).toBe(true);

    // The public lobby never carries the history (it holds everyone's cards).
    expect('history' in publicPokerLobby(lobby, 'alice')).toBe(false);
    tickPokerLobby(lobby);
    expect(publicPokerHistory(lobby, 'alice')).toHaveLength(1);
  });

  it('lets a busted player take a new stack of play chips', () => {
    const lobby = createPokerLobby({ id: 'carol', nickname: 'Carol' });
    joinPokerLobby(lobby, { id: 'dave', nickname: 'Dave' });
    expect(() => rebuyPoker(lobby, 'carol')).toThrow();
    lobby.players[0].chips = 0;
    rebuyPoker(lobby, 'carol');
    expect(lobby.players[0].chips).toBe(1000);

    // Right after a busting hand the seat still shows the old stack; the finished hand has the real one.
    startPokerLobby(lobby, 'carol');
    finishByFolds(lobby);
    const loser = lobby.hand!.players.find((player) => player.chips < 1000)!;
    loser.chips = 0;
    const seat = lobby.players.find((player) => player.id === loser.id)!;
    expect(seat.chips).toBeGreaterThan(0);
    rebuyPoker(lobby, loser.id);
    expect(seat.chips).toBe(1000);
  });

  it('always lists the permanent table and deals there once two players sit down', () => {
    const listed = listPokerLobbies();
    expect(listed[0]).toMatchObject({ id: MAIN_POKER_LOBBY_ID, permanent: true });

    const main = getPokerLobby(MAIN_POKER_LOBBY_ID)!;
    joinPokerLobby(main, { id: 'erin', nickname: 'Erin' });
    expect(main.hand).toBeNull();
    // The waiting table still tells the viewer where they sit.
    expect(publicPokerLobby(main, 'erin')).toMatchObject({ hand: null, viewer_id: 'erin', permanent: true });
    addPokerBot(main);
    expect(main.hand).not.toBeNull();
    expect(main.status).toBe('playing');

    expect(leavePokerLobby(main, 'erin')).toBeNull();
    expect(getPokerLobby(MAIN_POKER_LOBBY_ID)).toMatchObject({ players: [], hand: null, status: 'waiting' });
    expect(listPokerLobbies()[0].id).toBe(MAIN_POKER_LOBBY_ID);

    // A full permanent table stays listed, marked full.
    for (let index = 0; index < 8; index += 1) joinPokerLobby(main, { id: `full-${index}`, nickname: `Full ${index}` });
    expect(listPokerLobbies()[0]).toMatchObject({ id: MAIN_POKER_LOBBY_ID, full: true });
    for (let index = 0; index < 8; index += 1) leavePokerLobby(main, `full-${index}`);
  });
});
