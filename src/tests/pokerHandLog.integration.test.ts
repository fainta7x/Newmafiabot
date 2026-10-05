import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensurePokerRuntimeSchema } from '../db/ensurePokerRuntimeSchema.ts';
import { pokerOpponentProfile, resetPokerBotMemoryForTests } from '../server/services/pokerBot.ts';
import { applyPokerAction } from '../server/services/pokerEngine.ts';
import { createPokerLobby, joinPokerLobby, nextPokerHand, startPokerLobby } from '../server/services/pokerLobbyService.ts';
import { resetPokerRuntimeCacheForTesting, withPersistedPokerRuntime } from '../server/services/pokerPersistenceService.ts';

describe('stored poker hands teach the bots', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    resetPokerBotMemoryForTests();
    resetPokerRuntimeCacheForTesting();
    db = createDatabaseConnection(':memory:');
    await ensurePokerRuntimeSchema(db);
  });

  it('writes a finished hand of people to the log', async () => {
    await withPersistedPokerRuntime(db, () => {
      const lobby = createPokerLobby({ id: 'alice', nickname: 'Алиса' });
      joinPokerLobby(lobby, { id: 'bob', nickname: 'Боб' });
      startPokerLobby(lobby, 'alice');
      const hand = lobby.hand!;
      applyPokerAction(hand, { type: 'fold' });
      expect(hand.street).toBe('finished');
      nextPokerHand(lobby);
    });
    const rows = await db.all<{ id: string; hand_json: string }>(`SELECT id, hand_json FROM poker_hand_log`);
    expect(rows).toHaveLength(1);
    const stored = JSON.parse(rows[0].hand_json);
    expect(stored.players.map((player: any) => player.id).sort()).toEqual(['alice', 'bob']);
    expect(stored.actions.some((action: any[]) => action[2] === 'fold')).toBe(true);
  });

  it('keeps a finished hand queued when its insert fails, and writes it on the next request', async () => {
    await withPersistedPokerRuntime(db, () => { createPokerLobby({ id: 'alice', nickname: 'Алиса' }); });
    await db.run('ALTER TABLE poker_hand_log RENAME TO poker_hand_log_off');
    await expect(withPersistedPokerRuntime(db, () => {
      const lobby = createPokerLobby({ id: 'carol', nickname: 'Кэрол' });
      joinPokerLobby(lobby, { id: 'dan', nickname: 'Дэн' });
      startPokerLobby(lobby, 'carol');
      applyPokerAction(lobby.hand!, { type: 'fold' });
      nextPokerHand(lobby);
    })).rejects.toThrow();
    await db.run('ALTER TABLE poker_hand_log_off RENAME TO poker_hand_log');
    await withPersistedPokerRuntime(db, () => undefined);
    expect((await db.all(`SELECT id FROM poker_hand_log`))).toHaveLength(1);
  });

  it('rebuilds the opponent memory from the log after a restart', async () => {
    const hand = (id: string) => JSON.stringify({
      id, at: 1, small_blind: 10, big_blind: 20, board: [],
      players: [{ id: 'hero', seat: 1, net: 0, cards: [] }, { id: 'villain', seat: 2, net: 0, cards: [] }],
      actions: [['preflop', 'villain', 'raise', 60], ['preflop', 'hero', 'call', 60]],
    });
    for (let i = 0; i < 12; i += 1) await db.run(`INSERT INTO poker_hand_log (id, played_at, hand_json) VALUES (?,?,?)`, [`h${i}`, i, hand(`h${i}`)]);
    expect(pokerOpponentProfile('villain').known).toBe(false);
    const profile = await withPersistedPokerRuntime(db, () => pokerOpponentProfile('villain'));
    expect(profile.known).toBe(true);
    expect(profile.pfr).toBeGreaterThan(0.6);
    // The memory belongs to this database: another database in the same process does not see it.
    const other = createDatabaseConnection(':memory:');
    await ensurePokerRuntimeSchema(other);
    expect((await withPersistedPokerRuntime(other, () => pokerOpponentProfile('villain'))).known).toBe(false);
    expect(pokerOpponentProfile('villain').known).toBe(false);
  });
});
