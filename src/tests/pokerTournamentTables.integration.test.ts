import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { pokerTournamentLobbies, tickPokerLobby } from '../server/services/pokerLobbyService.ts';
import { withPersistedPokerRuntime } from '../server/services/pokerPersistenceService.ts';
import { createPokerTournament, lateRegisterInPokerTournament, rebuyInPokerTournament, registerForPokerTournament, tickPokerTournaments } from '../server/services/pokerTournamentService.ts';
import { settlePokerTournamentRewards } from '../server/services/pokerTournamentRewardsService.ts';

const stamp = '2026-10-10T10:00:00.000Z';
const now = Date.parse('2026-10-20T10:00:00Z');
const start = Date.parse('2026-10-20T18:00:00Z');
const LEVEL_MS = 6 * 60_000;

describe('poker tournament tables', () => {
  let db: DatabaseWrapper;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    for (let index = 1; index <= 10; index += 1) {
      await db.run(
        `INSERT INTO players (id,nickname,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at)
         VALUES (?,?,'normal','normal','none',1000,1000,?,?)`,
        [`p${index}`, `Игрок ${index}`, stamp, stamp],
      );
    }
  });

  const begin = async (players: number, extra: Record<string, unknown> = {}) => {
    const row = await createPokerTournament(db, null, { title: 'Турбо', startAt: new Date(start).toISOString(), minPlayers: 2, ...extra }, now);
    for (let index = 1; index <= players; index += 1) await registerForPokerTournament(db, row.id, `p${index}`);
    await tickPokerTournaments(db, start + 1000);
    return row.id;
  };
  const lobbies = (id: string) => withPersistedPokerRuntime(db, () => pokerTournamentLobbies(id).map((lobby) => ({ id: lobby.id, players: lobby.players.map((seat) => seat.id), chips: lobby.players.map((seat) => seat.chips), blinds: lobby.hand ? [lobby.hand.small_blind, lobby.hand.big_blind] : null, mode: lobby.money_mode })));
  /** Ends the current hand at the tables of these players with them out of chips (the others keep playing). */
  const bust = (id: string, playerIds: string[], at: number, startChips: Record<string, number> = {}) => withPersistedPokerRuntime(db, () => {
    for (const lobby of pokerTournamentLobbies(id)) {
      const ids = playerIds.filter((playerId) => lobby.players.some((seat) => seat.id === playerId));
      if (!ids.length) continue;
      if (!lobby.hand) tickPokerLobby(lobby);
      const hand = lobby.hand!;
      hand.street = 'finished';
      hand.finished_at = at;
      for (const player of hand.players) {
        if (ids.includes(player.id)) { player.chips = 0; player.start_chips = startChips[player.id] ?? player.start_chips; }
      }
    }
  });
  const entry = (id: string, playerId: string) => db.get<any>('SELECT status, place, busted_at FROM poker_tournament_entries WHERE tournament_id = ? AND player_id = ?', [id, playerId]);

  it('seats everybody evenly at tables of the chosen size and deals with the first-level blinds', async () => {
    const id = await begin(8, { seatsPerTable: 6, startingStack: 1500 });
    const tables = await lobbies(id);
    expect(tables.map((table) => table.players.length)).toEqual([4, 4]);
    expect(new Set(tables.flatMap((table) => table.players)).size).toBe(8);
    expect(tables.every((table) => table.mode === 'tournament' && table.chips.every((chips) => chips === 1500))).toBe(true);
    expect(tables.map((table) => table.blinds)).toEqual([[10, 20], [10, 20]]);
    expect((await db.get<any>('SELECT status FROM poker_tournaments WHERE id = ?', [id])).status).toBe('running');
  });

  it('puts a bust-out in his place at once when no re-buy is left, bigger starting stack higher', async () => {
    const id = await begin(8, { seatsPerTable: 8, rebuyUntilLevel: 0 });
    await bust(id, ['p1'], start + 5000);
    await tickPokerTournaments(db, start + 6000);
    expect(await entry(id, 'p1')).toMatchObject({ status: 'eliminated', place: 8 });
    expect((await lobbies(id))[0].players).not.toContain('p1');

    await bust(id, ['p2', 'p3'], start + 20_000, { p2: 400, p3: 900 });
    await tickPokerTournaments(db, start + 21_000);
    expect(await entry(id, 'p2')).toMatchObject({ status: 'eliminated', place: 7 });
    expect(await entry(id, 'p3')).toMatchObject({ status: 'eliminated', place: 6 });
  });

  it('keeps a bust-out in the game while the re-buy is open and places him when it closes, the later one higher', async () => {
    const id = await begin(6, { seatsPerTable: 8, rebuyUntilLevel: 2, rebuyCostTokens: 100 });
    await bust(id, ['p1'], start + 5000);
    await tickPokerTournaments(db, start + 6000);
    await bust(id, ['p2'], start + 60_000);
    await tickPokerTournaments(db, start + 61_000);
    expect(await entry(id, 'p1')).toMatchObject({ status: 'playing', place: null });
    expect((await entry(id, 'p1')).busted_at).not.toBeNull();
    expect((await lobbies(id))[0].players).toContain('p1');

    await tickPokerTournaments(db, start + 1000 + 2 * LEVEL_MS + 1000);
    expect(await entry(id, 'p2')).toMatchObject({ status: 'eliminated', place: 5 });
    expect(await entry(id, 'p1')).toMatchObject({ status: 'eliminated', place: 6 });
  });

  it('closes a table that is no longer needed, moves its players, and crowns the last player', async () => {
    const id = await begin(4, { seatsPerTable: 2, rebuyUntilLevel: 0 });
    expect((await lobbies(id)).map((table) => table.players.length)).toEqual([2, 2]);

    await bust(id, ['p1'], start + 5000);
    await tickPokerTournaments(db, start + 6000);
    expect((await lobbies(id)).reduce((sum, table) => sum + table.players.length, 0)).toBe(3);

    const second = (await lobbies(id)).flatMap((table) => table.players)[0];
    await bust(id, [second], start + 30_000);
    await tickPokerTournaments(db, start + 31_000);
    const afterTwo = await lobbies(id);
    expect(afterTwo).toHaveLength(1);
    expect(afterTwo[0].players).toHaveLength(2);

    const third = afterTwo[0].players[0];
    await bust(id, [third], start + 60_000);
    await tickPokerTournaments(db, start + 61_000);
    expect((await db.get<any>('SELECT status FROM poker_tournaments WHERE id = ?', [id])).status).toBe('running'); // the result is still on the screen
    await tickPokerTournaments(db, start + 80_000);
    expect((await db.get<any>('SELECT status FROM poker_tournaments WHERE id = ?', [id])).status).toBe('finished');
    expect(await lobbies(id)).toHaveLength(0);
    const places = (await db.all<any>('SELECT place FROM poker_tournament_entries WHERE tournament_id = ? ORDER BY place', [id])).map((row) => row.place);
    expect(places).toEqual([1, 2, 3, 4]);
  });

  it('orders simultaneous bust-outs by their starting stacks even when the next deal replaced the hand before anyone looked', async () => {
    const id = await begin(6, { seatsPerTable: 8, rebuyUntilLevel: 0 });
    await withPersistedPokerRuntime(db, () => {
      const lobby = pokerTournamentLobbies(id)[0];
      tickPokerLobby(lobby);
      const hand = lobby.hand!;
      hand.street = 'finished';
      hand.finished_at = Date.now() - 10_000; // long past the result pause: the next tick deals again
      for (const player of hand.players) {
        if (player.id === 'p1') { player.chips = 0; player.start_chips = 300; }
        if (player.id === 'p2') { player.chips = 0; player.start_chips = 800; }
      }
      tickPokerLobby(lobby); // the next deal replaces the finished hand
      expect(lobby.hand!.id).not.toBe(hand.id);
    });
    await tickPokerTournaments(db, start + 6000);
    expect(await entry(id, 'p1')).toMatchObject({ status: 'eliminated', place: 6 });
    expect(await entry(id, 'p2')).toMatchObject({ status: 'eliminated', place: 5 });
  });

  it('keeps a player away while his table is closed and he is moved', async () => {
    const id = await begin(4, { seatsPerTable: 2, rebuyUntilLevel: 0 });
    const tables = await lobbies(id);
    const away = tables[1].players[0];
    await withPersistedPokerRuntime(db, () => { for (const lobby of pokerTournamentLobbies(id)) for (const seat of lobby.players) if (seat.id === away) seat.sitting_out = true; });
    // The other table's two players bust one after another so that the small table has to be closed.
    await bust(id, [tables[0].players[0]], start + 5000);
    await tickPokerTournaments(db, start + 6000);
    await bust(id, [tables[0].players[1]], start + 30_000);
    await tickPokerTournaments(db, start + 31_000);
    const moved = await withPersistedPokerRuntime(db, () => pokerTournamentLobbies(id).flatMap((lobby) => lobby.players).find((seat) => seat.id === away));
    expect(moved?.sitting_out).toBe(true);
  });

  const tokens = async (playerId: string) => Number((await db.get<any>('SELECT tokens FROM players WHERE id = ?', [playerId]))?.tokens);
  const rebuy = (id: string, playerId: string, at: number) => withPersistedPokerRuntime(db, () => rebuyInPokerTournament(db, id, playerId, at));

  it('lets a busted player buy back in for his own tokens while the re-buy is open, once per bust', async () => {
    const id = await begin(4, { seatsPerTable: 8, rebuyUntilLevel: 2, rebuyCostTokens: 100, rebuyChips: 1200 });
    await expect(rebuy(id, 'p1', start + 3000)).rejects.toThrow('фишки закончились');
    await bust(id, ['p1'], start + 5000);
    await tickPokerTournaments(db, start + 6000);
    expect((await entry(id, 'p1')).busted_at).not.toBeNull();

    await rebuy(id, 'p1', start + 7000);
    expect(await tokens('p1')).toBe(900);
    expect(await entry(id, 'p1')).toMatchObject({ status: 'playing', busted_at: null });
    expect((await db.get<any>('SELECT rebuys FROM poker_tournament_entries WHERE tournament_id = ? AND player_id = ?', [id, 'p1'])).rebuys).toBe(1);
    expect((await lobbies(id))[0].chips[(await lobbies(id))[0].players.indexOf('p1')]).toBe(1200);
    await expect(rebuy(id, 'p1', start + 8000)).rejects.toThrow('фишки закончились');
    expect(await tokens('p1')).toBe(900);
  });

  it('refuses a re-buy without the tokens or after the re-buy closed, and takes nothing', async () => {
    const id = await begin(4, { seatsPerTable: 8, rebuyUntilLevel: 1, rebuyCostTokens: 100 });
    await db.run("UPDATE players SET tokens = 50 WHERE id = 'p2'");
    await bust(id, ['p1', 'p2'], start + 5000);
    await tickPokerTournaments(db, start + 6000);
    await expect(rebuy(id, 'p2', start + 7000)).rejects.toThrow('нужно 100');
    expect(await tokens('p2')).toBe(50);
    await expect(rebuy(id, 'p1', start + 1000 + LEVEL_MS + 5000)).rejects.toThrow('Время докупки закончилось');
    expect(await tokens('p1')).toBe(1000);
  });

  it('pays the prizes by place, gives the winner a cup and the next two medals, and the winner the achievements', async () => {
    const id = await begin(3, { seatsPerTable: 8, rebuyUntilLevel: 0, prizeTokens: [500, 200] });
    await bust(id, ['p1'], start + 5000);
    await tickPokerTournaments(db, start + 6000);
    await bust(id, ['p2'], start + 30_000);
    await tickPokerTournaments(db, start + 31_000);
    await tickPokerTournaments(db, start + 60_000);
    expect((await db.get<any>('SELECT status FROM poker_tournaments WHERE id = ?', [id])).status).toBe('finished');

    expect(await tokens('p3')).toBe(1500);
    expect(await tokens('p2')).toBe(1200);
    expect(await tokens('p1')).toBe(1000);
    const awards = await db.all<any>("SELECT player_id, kind, place_result, tournament_id FROM player_verified_awards WHERE source = ? ORDER BY place_result", [`poker_tournament:${id}`]);
    expect(awards.map((award) => [award.player_id, award.kind, award.place_result])).toEqual([['p3', 'trophy', '1 место'], ['p2', 'medal', '2 место'], ['p1', 'medal', '3 место']]);
    expect(awards.every((award) => award.tournament_id === null)).toBe(true);
    const achievements = await db.all<any>("SELECT achievement_id FROM player_achievements WHERE player_id = 'p3'");
    expect(achievements.map((item) => item.achievement_id)).toContain('poker_champion');

    // Settling again must pay and award nothing twice.
    const config = JSON.parse((await db.get<any>('SELECT config_json FROM poker_tournaments WHERE id = ?', [id])).config_json);
    await settlePokerTournamentRewards(db, { id, title: 'Турбо' }, config, new Date(start + 90_000).toISOString());
    expect(await tokens('p3')).toBe(1500);
    expect(await db.all("SELECT id FROM player_verified_awards WHERE source = ?", [`poker_tournament:${id}`])).toHaveLength(3);
  });

  it('pays a prize pool made of the guarantee and every re-buy by the shares', async () => {
    const id = await begin(3, { seatsPerTable: 8, rebuyUntilLevel: 0, rebuyCostTokens: 200, guaranteeTokens: 2000, prizeSharesPct: [65, 25, 10] });
    await db.run("UPDATE poker_tournament_entries SET rebuys = 2 WHERE tournament_id = ? AND player_id = 'p1'", [id]);
    await bust(id, ['p1'], start + 5000);
    await tickPokerTournaments(db, start + 6000);
    await bust(id, ['p2'], start + 30_000);
    await tickPokerTournaments(db, start + 31_000);
    await tickPokerTournaments(db, start + 60_000);
    // pool = 2000 + 2 re-buys x 200 = 2400: 65% / 25% / 10%
    expect(await tokens('p3')).toBe(1000 + 1560);
    expect(await tokens('p2')).toBe(1000 + 600);
    expect(await tokens('p1')).toBe(1000 + 240);
    expect((await db.get<any>("SELECT prize_tokens FROM poker_tournament_entries WHERE tournament_id = ? AND player_id = 'p3'", [id])).prize_tokens).toBe(1560);
  });

  describe('a whole tournament played by the machinery itself', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('deals real hands with rising blinds until one player is left and the places are 1 to N', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(start);
      const id = await begin(3, { seatsPerTable: 8, rebuyUntilLevel: 0, levelMinutes: 1, startingStack: 1000 });
      // Everybody is away: each hand is folded for them, so the blinds do the work.
      await withPersistedPokerRuntime(db, () => { for (const lobby of pokerTournamentLobbies(id)) for (const seat of lobby.players) seat.sitting_out = true; });
      let finished = false;
      const seenBlinds = new Set<string>();
      for (let step = 0; step < 4000 && !finished; step += 1) {
        vi.setSystemTime(start + 1000 + step * 2000);
        await tickPokerTournaments(db, Date.now());
        for (const table of await lobbies(id)) if (table.blinds) seenBlinds.add(table.blinds.join('/'));
        finished = (await db.get<any>('SELECT status FROM poker_tournaments WHERE id = ?', [id])).status === 'finished';
      }
      expect(finished).toBe(true);
      expect(seenBlinds.size).toBeGreaterThan(2); // the blinds went up while it was played
      const places = (await db.all<any>('SELECT place FROM poker_tournament_entries WHERE tournament_id = ? ORDER BY place', [id])).map((row) => row.place);
      expect(places).toEqual([1, 2, 3]);
    }, 60_000);
  });
});

describe('entering a running poker tournament late', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    for (let index = 1; index <= 12; index += 1) {
      await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at) VALUES (?,?,'normal','normal','none',1000,1000,?,?)`, [`p${index}`, `Игрок ${index}`, stamp, stamp]);
    }
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const begin = async (players: number, extra: Record<string, unknown> = {}) => {
    const row = await createPokerTournament(db, null, { title: 'Турбо', startAt: new Date(start).toISOString(), minPlayers: 2, ...extra }, now);
    for (let index = 1; index <= players; index += 1) await registerForPokerTournament(db, row.id, `p${index}`);
    await tickPokerTournaments(db, start + 1000);
    return row.id;
  };
  const late = (id: string, playerId: string, at: number) => withPersistedPokerRuntime(db, () => lateRegisterInPokerTournament(db, id, playerId, at));
  const seats = (id: string) => withPersistedPokerRuntime(db, () => pokerTournamentLobbies(id).map((lobby) => ({ id: lobby.id, players: lobby.players.map((seat) => ({ id: seat.id, chips: seat.chips })) })));

  it('seats a newcomer with the starting stack at the emptiest table until the chosen level ends', async () => {
    const id = await begin(5, { seatsPerTable: 6, lateRegUntilLevel: 3, startingStack: 1500 });
    const result = await late(id, 'p6', start + 2 * LEVEL_MS + 1000);
    expect(result.id).toBe(id);
    const tables = await seats(id);
    expect(tables).toHaveLength(1);
    expect(tables[0].players.find((seat) => seat.id === 'p6')).toEqual({ id: 'p6', chips: 1500 });
    expect(await db.get("SELECT status, busted_at FROM poker_tournament_entries WHERE tournament_id = ? AND player_id = 'p6'", [id])).toEqual({ status: 'playing', busted_at: null });
    // asking again changes nothing
    await late(id, 'p6', start + 2 * LEVEL_MS + 2000);
    expect((await seats(id))[0].players.filter((seat) => seat.id === 'p6')).toHaveLength(1);
  });

  it('opens a new table when every table is full, and keeps the newcomer out of the tournament once the level has ended', async () => {
    const id = await begin(6, { seatsPerTable: 6, lateRegUntilLevel: 2 });
    await late(id, 'p7', start + 1000);
    const tables = await seats(id);
    expect(tables).toHaveLength(2);
    expect(tables.map((table) => table.players.length).sort()).toEqual([1, 6]);
    await expect(late(id, 'p8', start + 2 * LEVEL_MS + 1000)).rejects.toThrow('Поздняя запись в этот турнир закончилась');
    expect(await db.get("SELECT 1 AS found FROM poker_tournament_entries WHERE tournament_id = ? AND player_id = 'p8'", [id])).toBeNull();
  });

  it('is closed when the organizer set no late registration, respects the maximum and lets nobody back in who has gone out', async () => {
    const closed = await begin(4, { lateRegUntilLevel: 0 });
    await expect(late(closed, 'p9', start + 1000)).rejects.toThrow('Поздняя запись');

    const full = await begin(3, { maxPlayers: 3, lateRegUntilLevel: 6 });
    await expect(late(full, 'p10', start + 1000)).rejects.toThrow('Все места на турнир заняты');

    const open = await begin(4, { lateRegUntilLevel: 6, rebuyUntilLevel: 0 });
    await db.run("UPDATE poker_tournament_entries SET status = 'eliminated', place = 4 WHERE tournament_id = ? AND player_id = 'p1'", [open]);
    await expect(late(open, 'p1', start + 1000)).rejects.toThrow('уже вышел');
  });

  it('puts the entry before the first seating pass without creating a table of its own', async () => {
    const row = await createPokerTournament(db, null, { title: 'Турбо', startAt: new Date(start).toISOString(), minPlayers: 2, lateRegUntilLevel: 6 }, now);
    await registerForPokerTournament(db, row.id, 'p1');
    await registerForPokerTournament(db, row.id, 'p2');
    await db.run("UPDATE poker_tournaments SET status = 'running', started_at = ? WHERE id = ?", [new Date(start).toISOString(), row.id]);
    await db.run("UPDATE poker_tournament_entries SET status = 'playing' WHERE tournament_id = ?", [row.id]);
    await late(row.id, 'p3', start + 1000);
    expect(await seats(row.id)).toEqual([]);
    await tickPokerTournaments(db, start + 2000);
    expect((await seats(row.id))[0].players.map((seat) => seat.id).sort()).toEqual(['p1', 'p2', 'p3']);
  });
});
