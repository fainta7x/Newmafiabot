import type { DatabaseWrapper } from '../../db/index.ts';
import {
  planPokerTournamentTables, pokerTournamentClock, pokerTournamentRebuyOpen, POKER_TOURNAMENT_MAX_SEATS, type PokerTournamentConfig,
} from '../../shared/pokerTournament.ts';
import {
  createPokerTournamentLobby, freePokerSeat, pokerTournamentLobbies, removePokerTournamentLobby, tickPokerLobby, type PokerLobby,
} from './pokerLobbyService.ts';

/**
 * The tables of a running poker tournament (owner, 2026-10-10). The tables are ordinary poker tables of the existing
 * engine; this service seats the players, finds who busted, gives the places, closes and balances tables between hands
 * and ends the tournament. Everything runs inside the persisted poker runtime, so a restart loses nothing.
 */
type RunningRow = { id: string; title: string; started_at: string | null; config_json: string };
type EntryRow = { player_id: string; nickname: string; busted_at: string | null; busted_start_chips: number };

const shuffled = <T>(items: T[]): T[] => {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

const entriesOf = (db: DatabaseWrapper, tournamentId: string, where: string) => db.all<EntryRow>(
  `SELECT e.player_id, COALESCE(p.nickname, 'Игрок') AS nickname, e.busted_at, e.busted_start_chips
     FROM poker_tournament_entries e LEFT JOIN players p ON p.id = e.player_id
    WHERE e.tournament_id = ? AND e.status = 'playing' AND ${where}`,
  [tournamentId],
);

const RESULT_PAUSE_MS = 6000;
const betweenHands = (lobby: PokerLobby) => !lobby.hand || lobby.hand.street === 'finished';

/** After a hand the seats still hold the old stacks until the next deal; copy the real ones before anybody moves. */
const syncSeatsFromFinishedHand = (lobby: PokerLobby) => {
  if (lobby.hand?.street !== 'finished') return;
  for (const seat of lobby.players) {
    const handPlayer = lobby.hand.players.find((item) => item.id === seat.id);
    if (handPlayer) seat.chips = handPlayer.chips;
  }
};

const seatTables = async (db: DatabaseWrapper, row: RunningRow, config: PokerTournamentConfig, startedAtMs: number) => {
  const players = shuffled(await entriesOf(db, row.id, 'e.busted_at IS NULL'));
  if (!players.length) return;
  const sizes = planPokerTournamentTables(players.length, config.seatsPerTable);
  let cursor = 0;
  sizes.forEach((size, index) => {
    const group = players.slice(cursor, cursor + size);
    cursor += size;
    createPokerTournamentLobby({
      tournamentId: row.id,
      tableNo: index + 1,
      title: sizes.length > 1 ? `Турнир «${row.title}» · стол ${index + 1}` : `Турнир «${row.title}»`,
      tournament: { started_at_ms: startedAtMs, level_minutes: config.levelMinutes, levels: config.levels, rebuy_until_level: config.rebuyUntilLevel },
      players: group.map((player) => ({ id: player.player_id, nickname: player.nickname, chips: config.startingStack })),
    });
  });
};

const dropFromTables = (lobbies: PokerLobby[], playerId: string, nickname: string, place: number) => {
  for (const lobby of lobbies) {
    if (!lobby.players.some((seat) => seat.id === playerId)) continue;
    lobby.players = lobby.players.filter((seat) => seat.id !== playerId);
    lobby.tournament!.out = [...(lobby.tournament!.out || []), { id: playerId, nickname, place }].sort((a, b) => a.place - b.place);
  }
};

/**
 * Players who have run out of chips. The seat is the source of truth, not only the hand that just ended: the scan runs
 * every few seconds, so a busted player may already sit out the next deal when it gets to him.
 */
const settleBusts = async (db: DatabaseWrapper, row: RunningRow, config: PokerTournamentConfig, startedAtMs: number, nowMs: number) => {
  const lobbies = pokerTournamentLobbies(row.id);
  const rebuyOpen = pokerTournamentRebuyOpen(config, pokerTournamentClock(config, startedAtMs, nowMs));
  const waiting = new Set((await entriesOf(db, row.id, 'e.busted_at IS NOT NULL')).map((entry) => entry.player_id));
  const busted: Array<{ id: string; nickname: string; startChips: number }> = [];
  for (const lobby of lobbies) {
    for (const seat of lobby.players) {
      if (waiting.has(seat.id)) continue;
      const handPlayer = lobby.hand?.players.find((item) => item.id === seat.id);
      if (handPlayer && lobby.hand!.street !== 'finished') continue; // still playing this hand, all-in is not out
      const stack = handPlayer ? handPlayer.chips : seat.chips;
      if (stack > 0) continue;
      const note = lobby.tournament!.bust_notes?.find((item) => item.id === seat.id);
      busted.push({ id: seat.id, nickname: seat.nickname, startChips: Math.max(0, Math.trunc(handPlayer?.start_chips ?? note?.start_chips ?? 0)) });
    }
  }
  // Whatever was noted has now been read (or the player is no longer at zero).
  for (const lobby of lobbies) if (lobby.tournament!.bust_notes?.length) lobby.tournament!.bust_notes = [];
  if (!busted.length) return;
  const nowIso = new Date(nowMs).toISOString();
  if (rebuyOpen) {
    // Not final yet: the player may buy back in until the chosen level ends.
    for (const player of busted) {
      await db.run('UPDATE poker_tournament_entries SET busted_at = ?, busted_start_chips = ?, updated_at = ? WHERE tournament_id = ? AND player_id = ? AND busted_at IS NULL',
        [nowIso, player.startChips, nowIso, row.id, player.id]);
    }
    return;
  }
  // Final: with N players alive before this pass the first to go out takes place N. Several out together are ordered by
  // the stack they started the hand with (the bigger stack finishes higher).
  const alive = (await entriesOf(db, row.id, 'e.busted_at IS NULL')).length;
  const ordered = busted.sort((a, b) => a.startChips - b.startChips);
  for (const [index, player] of ordered.entries()) {
    const place = alive - index;
    await db.run("UPDATE poker_tournament_entries SET status = 'eliminated', place = ?, updated_at = ? WHERE tournament_id = ? AND player_id = ?", [place, nowIso, row.id, player.id]);
    dropFromTables(lobbies, player.id, player.nickname, place);
  }
};

/** When the re-buy ends, everyone still waiting for it is out, the later bust-out placed higher. */
const closeRebuyWindow = async (db: DatabaseWrapper, row: RunningRow, config: PokerTournamentConfig, startedAtMs: number, nowMs: number) => {
  if (pokerTournamentRebuyOpen(config, pokerTournamentClock(config, startedAtMs, nowMs))) return;
  const waiting = await entriesOf(db, row.id, 'e.busted_at IS NOT NULL');
  if (!waiting.length) return;
  const alive = (await entriesOf(db, row.id, 'e.busted_at IS NULL')).length;
  const ordered = waiting.slice().sort((a, b) => String(b.busted_at).localeCompare(String(a.busted_at)) || b.busted_start_chips - a.busted_start_chips);
  const lobbies = pokerTournamentLobbies(row.id);
  const nowIso = new Date(nowMs).toISOString();
  for (const [index, player] of ordered.entries()) {
    const place = alive + 1 + index;
    await db.run("UPDATE poker_tournament_entries SET status = 'eliminated', place = ?, updated_at = ? WHERE tournament_id = ? AND player_id = ?", [place, nowIso, row.id, player.player_id]);
    dropFromTables(lobbies, player.player_id, player.nickname, place);
  }
};

/** Closes tables that are no longer needed and keeps the rest even; people move only between hands. */
const balanceTables = (row: RunningRow, config: PokerTournamentConfig) => {
  const capacity = Math.min(POKER_TOURNAMENT_MAX_SEATS, config.seatsPerTable);
  for (let guard = 0; guard < 50; guard += 1) {
    const lobbies = pokerTournamentLobbies(row.id);
    const total = lobbies.reduce((sum, lobby) => sum + lobby.players.length, 0);
    const wanted = Math.max(1, Math.ceil(total / capacity));
    const smallest = lobbies.slice().sort((a, b) => a.players.length - b.players.length)[0];
    if (lobbies.length > wanted && smallest && betweenHands(smallest)) {
      // Break the smallest table: everybody goes to the emptiest of the others.
      syncSeatsFromFinishedHand(smallest);
      const others = lobbies.filter((lobby) => lobby !== smallest);
      let moved = true;
      for (const seat of smallest.players.slice()) {
        const target = others.filter((lobby) => lobby.players.length < capacity).sort((a, b) => a.players.length - b.players.length)[0];
        if (!target) { moved = false; break; }
        target.players.push({ ...seat, seat: freePokerSeat(target) });
        smallest.players = smallest.players.filter((item) => item.id !== seat.id);
      }
      if (moved) removePokerTournamentLobby(smallest.id);
      continue;
    }
    // Keep the tables within one seat of each other.
    const biggest = lobbies.slice().sort((a, b) => b.players.length - a.players.length)[0];
    if (biggest && smallest && biggest !== smallest && biggest.players.length - smallest.players.length >= 2 && betweenHands(biggest) && smallest.players.length < capacity) {
      syncSeatsFromFinishedHand(biggest);
      const seat = biggest.players.slice().sort((a, b) => b.seat - a.seat)[0];
      smallest.players.push({ ...seat, seat: freePokerSeat(smallest) });
      biggest.players = biggest.players.filter((item) => item.id !== seat.id);
      continue;
    }
    return;
  }
};

/** One pass over a running tournament. Must run inside the persisted poker runtime. */
export async function processRunningPokerTournament(db: DatabaseWrapper, row: RunningRow, nowMs = Date.now()) {
  if (!row.started_at) return { finished: false };
  const config: PokerTournamentConfig = JSON.parse(row.config_json);
  const startedAtMs = Date.parse(row.started_at);

  if (!pokerTournamentLobbies(row.id).length) await seatTables(db, row, config, startedAtMs);
  // Settle before the tables move on, so a finished hand is read before the next deal replaces it; and once more after.
  await settleBusts(db, row, config, startedAtMs, nowMs);
  for (const lobby of pokerTournamentLobbies(row.id)) tickPokerLobby(lobby);

  await settleBusts(db, row, config, startedAtMs, nowMs);
  await closeRebuyWindow(db, row, config, startedAtMs, nowMs);
  balanceTables(row, config);

  const alive = (await entriesOf(db, row.id, 'e.busted_at IS NULL')).length;
  const waiting = (await entriesOf(db, row.id, 'e.busted_at IS NOT NULL')).length;
  for (const lobby of pokerTournamentLobbies(row.id)) lobby.tournament!.alive = alive;
  // The winner is declared once the last hand's result has been on the screen for a moment.
  const resultStillShown = pokerTournamentLobbies(row.id).some((lobby) => lobby.hand?.street === 'finished' && lobby.hand.finished_at && nowMs - lobby.hand.finished_at < RESULT_PAUSE_MS);
  if (alive <= 1 && waiting === 0 && !resultStillShown) {
    const nowIso = new Date(nowMs).toISOString();
    await db.run("UPDATE poker_tournament_entries SET place = 1, updated_at = ? WHERE tournament_id = ? AND status = 'playing' AND busted_at IS NULL", [nowIso, row.id]);
    await db.run("UPDATE poker_tournaments SET status = 'finished', finished_at = ?, updated_at = ? WHERE id = ? AND status = 'running'", [nowIso, nowIso, row.id]);
    for (const lobby of pokerTournamentLobbies(row.id)) removePokerTournamentLobby(lobby.id);
    return { finished: true };
  }
  return { finished: false };
}

/** Runs every running tournament once; the caller holds the persisted poker runtime. */
export async function processRunningPokerTournaments(db: DatabaseWrapper, nowMs = Date.now()) {
  const rows = await db.all<RunningRow>("SELECT id, title, started_at, config_json FROM poker_tournaments WHERE status = 'running'");
  const finished: string[] = [];
  for (const row of rows) if ((await processRunningPokerTournament(db, row, nowMs)).finished) finished.push(row.id);
  return { running: rows.length, finished };
}
