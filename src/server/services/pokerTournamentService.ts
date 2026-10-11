import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePokerTournamentSchema } from '../../db/ensurePokerTournamentSchema.ts';
import {
  normalizePokerTournamentConfig, pokerTournamentClock, pokerTournamentLateRegOpen, pokerTournamentRebuyOpen, pokerTournamentSchedule,
  type PokerTournamentConfig,
} from '../../shared/pokerTournament.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { withPersistedPokerRuntime } from './pokerPersistenceService.ts';
import { pokerTournamentLobbies, rebuyPoker } from './pokerLobbyService.ts';
import { mutateTokenBalance, TokenInsufficientFundsError } from './tokenLedgerService.ts';
import { processRunningPokerTournaments, seatLateEntrant } from './pokerTournamentTablesService.ts';
import { parsePokerTournamentAnnounce, runPokerTournamentAnnouncements } from './pokerTournamentAnnouncementService.ts';

export class PokerTournamentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type TournamentRow = {
  id: string; title: string; description: string; organizer_player_id: string | null;
  status: 'registration' | 'running' | 'finished' | 'cancelled'; cancel_reason: string | null;
  start_at: string; started_at: string | null; finished_at: string | null; config_json: string;
  notified_at: string | null; created_at: string; updated_at: string;
};

const parseConfig = (row: Pick<TournamentRow, 'config_json'>): PokerTournamentConfig => JSON.parse(row.config_json);
const cleanText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export const registeredCount = async (db: DatabaseWrapper, tournamentId: string): Promise<number> =>
  Number((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM poker_tournament_entries WHERE tournament_id = ? AND status != 'cancelled'", [tournamentId]))?.n || 0);

/** The shape clients get: settings, the clock while it runs, and the numbers they need to decide. */
export async function publicPokerTournament(db: DatabaseWrapper, row: TournamentRow, viewerId?: string | null, nowMs = Date.now()) {
  const config = parseConfig(row);
  const players = await registeredCount(db, row.id);
  const mine = viewerId
    ? await db.get<{ status: string; rebuys: number; place: number | null; busted_at: string | null }>('SELECT status, rebuys, place, busted_at FROM poker_tournament_entries WHERE tournament_id = ? AND player_id = ?', [row.id, viewerId])
    : null;
  const clock = row.status === 'running' && row.started_at ? pokerTournamentClock(config, Date.parse(row.started_at), nowMs) : null;
  const count = async (where: string) => Number((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM poker_tournament_entries WHERE tournament_id = ? AND ${where}`, [row.id]))?.n || 0);
  const alive = row.status === 'running' ? await count("status = 'playing' AND busted_at IS NULL") : null;
  const waitingRebuy = row.status === 'running' ? await count("status = 'playing' AND busted_at IS NOT NULL") : null;
  const standings = row.status === 'running' || row.status === 'finished'
    ? await db.all<{ nickname: string; place: number }>(
      `SELECT COALESCE(p.nickname, 'Игрок') AS nickname, e.place FROM poker_tournament_entries e LEFT JOIN players p ON p.id = e.player_id
        WHERE e.tournament_id = ? AND e.place IS NOT NULL ORDER BY e.place ASC LIMIT 50`, [row.id])
    : [];
  const myTable = viewerId && row.status === 'running' ? pokerTournamentLobbies(row.id).find((lobby) => lobby.players.some((seat) => seat.id === viewerId)) || null : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    cancel_reason: row.cancel_reason,
    start_at: row.start_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    settings: { ...config, lateRegUntilLevel: config.lateRegUntilLevel ?? 0 },
    players,
    spots_left: config.maxPlayers === null ? null : Math.max(0, config.maxPlayers - players),
    clock,
    rebuy_open: Boolean(clock && pokerTournamentRebuyOpen(config, clock)),
    late_reg_open: Boolean(clock && pokerTournamentLateRegOpen(config, clock)),
    schedule: pokerTournamentSchedule({ ...config, lateRegUntilLevel: config.lateRegUntilLevel ?? 0 }, Date.parse(row.started_at || row.start_at)),
    alive,
    waiting_rebuy: waitingRebuy,
    standings,
    my_table_id: myTable?.id ?? null,
    my_entry: mine && mine.status !== 'cancelled' ? { status: mine.status, rebuys: Number(mine.rebuys), place: mine.place, busted: Boolean(mine.busted_at) } : null,
  };
}

export async function createPokerTournament(db: DatabaseWrapper, organizerId: string | null, input: Record<string, unknown>, nowMs = Date.now()) {
  await ensurePokerTournamentSchema(db);
  const title = cleanText(input.title, 120);
  if (!title) throw new PokerTournamentError(400, 'Назовите турнир');
  const parsed = normalizePokerTournamentConfig(input, nowMs);
  if (!parsed.ok) throw new PokerTournamentError(400, parsed.error);
  const announce = parsePokerTournamentAnnounce(input.announce);
  const now = new Date(nowMs).toISOString();
  const id = `ptr_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO poker_tournaments (id, title, description, organizer_player_id, status, start_at, config_json, announce_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'registration', ?, ?, ?, ?, ?)`,
    [id, title, cleanText(input.description, 1000), organizerId, parsed.config.startAt, JSON.stringify(parsed.config), announce ? JSON.stringify(announce) : null, now, now],
  );
  return getPokerTournamentRow(db, id);
}

export async function getPokerTournamentRow(db: DatabaseWrapper, id: string): Promise<TournamentRow> {
  await ensurePokerTournamentSchema(db);
  const row = await db.get<TournamentRow>('SELECT * FROM poker_tournaments WHERE id = ? LIMIT 1', [id]);
  if (!row) throw new PokerTournamentError(404, 'Турнир не найден');
  return row;
}

export async function listPokerTournaments(db: DatabaseWrapper) {
  await ensurePokerTournamentSchema(db);
  return db.all<TournamentRow>(
    `SELECT * FROM poker_tournaments
      WHERE status IN ('registration','running') OR (status IN ('finished','cancelled') AND updated_at >= ?)
      ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'registration' THEN 1 ELSE 2 END, start_at ASC`,
    [new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()],
  );
}

export async function registerForPokerTournament(db: DatabaseWrapper, tournamentId: string, playerId: string) {
  // Status, capacity and the write happen in one transaction (they run one after another), so two players cannot
  // both take the last place and a registration cannot slip in while the scheduler starts or cancels the tournament.
  return db.transaction(async (tx) => {
    const row = await getPokerTournamentRow(tx, tournamentId);
    if (row.status !== 'registration') throw new PokerTournamentError(409, 'Запись на этот турнир закрыта');
    const config = parseConfig(row);
    const existing = await tx.get<{ status: string }>('SELECT status FROM poker_tournament_entries WHERE tournament_id = ? AND player_id = ?', [tournamentId, playerId]);
    if (existing && existing.status !== 'cancelled') return row; // idempotent
    if (config.maxPlayers !== null && await registeredCount(tx, tournamentId) >= config.maxPlayers) {
      throw new PokerTournamentError(409, 'Все места на турнир заняты');
    }
    const now = new Date().toISOString();
    if (existing) {
      await tx.run("UPDATE poker_tournament_entries SET status = 'registered', updated_at = ? WHERE tournament_id = ? AND player_id = ?", [now, tournamentId, playerId]);
    } else {
      await tx.run('INSERT INTO poker_tournament_entries (tournament_id, player_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [tournamentId, playerId, 'registered', now, now]);
    }
    return row;
  });
}

/**
 * Entering a tournament that has already started, until the level chosen by the organizer ends. The player gets the same
 * starting stack as everyone, enters free of charge like everybody else and is seated at once. Must run inside the persisted
 * poker runtime (the seat lives in it); the entry and the seat are saved together.
 */
export async function lateRegisterInPokerTournament(db: DatabaseWrapper, tournamentId: string, playerId: string, nowMs = Date.now()) {
  const row = await getPokerTournamentRow(db, tournamentId);
  if (row.status !== 'running' || !row.started_at) throw new PokerTournamentError(409, 'Запись на этот турнир закрыта');
  const config = parseConfig(row);
  const clock = pokerTournamentClock(config, Date.parse(row.started_at), nowMs);
  if (!pokerTournamentLateRegOpen(config, clock)) throw new PokerTournamentError(409, 'Поздняя запись в этот турнир закончилась');
  const existing = await db.get<{ status: string }>('SELECT status FROM poker_tournament_entries WHERE tournament_id = ? AND player_id = ?', [tournamentId, playerId]);
  if (existing && existing.status === 'playing') return row; // idempotent
  if (existing && existing.status !== 'cancelled') throw new PokerTournamentError(409, 'Игрок уже вышел из этого турнира');
  if (config.maxPlayers !== null && await registeredCount(db, tournamentId) >= config.maxPlayers) throw new PokerTournamentError(409, 'Все места на турнир заняты');
  const player = await db.get<{ nickname: string | null }>('SELECT nickname FROM players WHERE id = ? LIMIT 1', [playerId]);
  if (!player) throw new PokerTournamentError(404, 'Игрок не найден');
  const now = new Date(nowMs).toISOString();
  if (existing) {
    await db.run("UPDATE poker_tournament_entries SET status = 'playing', busted_at = NULL, busted_start_chips = 0, updated_at = ? WHERE tournament_id = ? AND player_id = ?", [now, tournamentId, playerId]);
  } else {
    await db.run("INSERT INTO poker_tournament_entries (tournament_id, player_id, status, created_at, updated_at) VALUES (?, ?, 'playing', ?, ?)", [tournamentId, playerId, now, now]);
  }
  seatLateEntrant(row, config, { id: playerId, nickname: String(player.nickname || 'Игрок') });
  return row;
}

export async function unregisterFromPokerTournament(db: DatabaseWrapper, tournamentId: string, playerId: string) {
  const row = await getPokerTournamentRow(db, tournamentId);
  if (row.status !== 'registration') throw new PokerTournamentError(409, 'Отписаться можно только до старта турнира');
  await db.run(
    "UPDATE poker_tournament_entries SET status = 'cancelled', updated_at = ? WHERE tournament_id = ? AND player_id = ? AND status = 'registered'",
    [new Date().toISOString(), tournamentId, playerId],
  );
  return row;
}

export async function cancelPokerTournament(db: DatabaseWrapper, tournamentId: string, reason: string, notify = true, nowMs = Date.now()) {
  const row = await getPokerTournamentRow(db, tournamentId);
  if (row.status === 'finished' || row.status === 'cancelled') return row;
  if (row.status === 'running') throw new PokerTournamentError(409, 'Идущий турнир отменить нельзя');
  const now = new Date(nowMs).toISOString();
  const changed = await db.run("UPDATE poker_tournaments SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ? AND status = 'registration'", [reason, now, tournamentId]);
  if (!changed.changes) return getPokerTournamentRow(db, tournamentId);
  const cancelled = { ...row, status: 'cancelled' as const, cancel_reason: reason, updated_at: now };
  if (notify) await deliverPokerTournamentNotices(db, cancelled);
  return cancelled;
}

const noticeText = (row: TournamentRow) => row.status === 'cancelled'
  ? `Покерный турнир «${row.title}» отменён: ${row.cancel_reason || 'отменён организатором'}`
  : `Покерный турнир «${row.title}» начался`;

/**
 * Queues the personal message for everyone registered and only then marks the tournament as announced. Every
 * message has its own idempotency key, so the scheduler repeats this for any tournament without the mark (a
 * crash or a failing channel never loses the message, and nothing is sent twice).
 */
async function deliverPokerTournamentNotices(db: DatabaseWrapper, row: TournamentRow) {
  const kind = row.status === 'cancelled' ? 'cancelled' : 'started';
  const players = await db.all<{ player_id: string }>("SELECT player_id FROM poker_tournament_entries WHERE tournament_id = ? AND status != 'cancelled'", [row.id]);
  try {
    for (const { player_id } of players) {
      await queuePersonalNotification(db, {
        notificationKey: `poker-tournament:${kind}:${row.id}:${player_id}`,
        playerId: String(player_id),
        eventType: `poker_tournament_${kind}`,
        entityId: row.id,
        text: noticeText(row),
        actionPath: '/player',
      });
    }
    await db.run('UPDATE poker_tournaments SET notified_at = ? WHERE id = ? AND notified_at IS NULL', [new Date().toISOString(), row.id]);
  } catch (error) {
    console.error('[POKER TOURNAMENT] notice delivery will be retried:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * The tournament scheduler (the server has no timers of its own, so it is driven by requests and the existing
 * heartbeat): at the start time a tournament with enough registered players starts, otherwise it is cancelled
 * and the registered players are told.
 */
export async function tickPokerTournaments(db: DatabaseWrapper, nowMs = Date.now()) {
  await ensurePokerTournamentSchema(db);
  const due = await db.all<TournamentRow>("SELECT * FROM poker_tournaments WHERE status = 'registration' AND start_at <= ?", [new Date(nowMs).toISOString()]);
  const result = { started: [] as string[], cancelled: [] as string[] };
  for (const row of due) {
    const config = parseConfig(row);
    const players = await registeredCount(db, row.id);
    if (players < config.minPlayers) {
      const after = await cancelPokerTournament(db, row.id, `записалось ${players} из ${config.minPlayers} нужных игроков`, true, nowMs);
      if (after.status === 'cancelled') result.cancelled.push(row.id);
      continue;
    }
    const now = new Date(nowMs).toISOString();
    // The status and the entries change together, and a start is reported only when this very call made it.
    const started = await db.transaction(async (tx) => {
      const changed = await tx.run("UPDATE poker_tournaments SET status = 'running', started_at = ?, updated_at = ? WHERE id = ? AND status = 'registration'", [now, now, row.id]);
      if (!changed.changes) return false;
      await tx.run("UPDATE poker_tournament_entries SET status = 'playing', updated_at = ? WHERE tournament_id = ? AND status = 'registered'", [now, row.id]);
      return true;
    });
    if (started) result.started.push(row.id);
  }
  // Running tournaments: tables, hands' busts, places, balancing and the finish all live in the poker runtime.
  const running = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM poker_tournaments WHERE status = 'running'");
  if (Number(running?.n || 0) > 0) await withPersistedPokerRuntime(db, () => processRunningPokerTournaments(db, nowMs));
  // Announcements in the club's groups and the reminder before the start.
  await runPokerTournamentAnnouncements(db, nowMs).catch((error) => console.error('[POKER TOURNAMENT] announcements failed:', error instanceof Error ? error.message : String(error)));
  // Messages that did not get out the first time (a crash, a failing channel) are retried here.
  const unannounced = await db.all<TournamentRow>("SELECT * FROM poker_tournaments WHERE status IN ('cancelled','running') AND notified_at IS NULL AND updated_at >= ?", [new Date(nowMs - 2 * 24 * 60 * 60_000).toISOString()]);
  for (const row of unannounced) await deliverPokerTournamentNotices(db, row);
  return result;
}

const TOURNAMENT_SCAN_INTERVAL_MS = 15_000;
let tournamentTimer: ReturnType<typeof setInterval> | null = null;
let tournamentScanInFlight = false;

/** Checks the start times every 15 seconds so a tournament starts (or is cancelled) on time without anyone polling. */
export function startPokerTournamentWorker(db: DatabaseWrapper) {
  if (tournamentTimer) return;
  const run = () => {
    if (tournamentScanInFlight) return;
    tournamentScanInFlight = true;
    void tickPokerTournaments(db)
      .catch((error) => console.error('[POKER TOURNAMENT] scan failed:', error instanceof Error ? error.message : String(error)))
      .finally(() => { tournamentScanInFlight = false; });
  };
  setTimeout(run, 5_000).unref?.();
  tournamentTimer = setInterval(run, TOURNAMENT_SCAN_INTERVAL_MS);
  tournamentTimer.unref?.();
}

/**
 * A busted player buys back in with his own club tokens while the re-buy is open (owner, 2026-10-10). Must run inside the
 * persisted poker runtime: the token debit, the new stack at the table and the entry change are one transaction.
 */
export async function rebuyInPokerTournament(db: DatabaseWrapper, tournamentId: string, playerId: string, nowMs = Date.now()) {
  const row = await getPokerTournamentRow(db, tournamentId);
  if (row.status !== 'running' || !row.started_at) throw new PokerTournamentError(409, 'Докупка возможна только в идущем турнире');
  const config = parseConfig(row);
  const clock = pokerTournamentClock(config, Date.parse(row.started_at), nowMs);
  if (!pokerTournamentRebuyOpen(config, clock)) throw new PokerTournamentError(409, 'Время докупки закончилось');
  const entry = await db.get<{ status: string; rebuys: number; busted_at: string | null }>('SELECT status, rebuys, busted_at FROM poker_tournament_entries WHERE tournament_id = ? AND player_id = ?', [tournamentId, playerId]);
  if (!entry || entry.status !== 'playing') throw new PokerTournamentError(409, 'Докупить может только игрок, который сейчас в турнире');
  if (!entry.busted_at) throw new PokerTournamentError(409, 'Докупка нужна, когда фишки закончились');
  const lobby = pokerTournamentLobbies(tournamentId).find((table) => table.players.some((seat) => seat.id === playerId));
  if (!lobby) throw new PokerTournamentError(409, 'Стол игрока не найден');
  if (config.rebuyCostTokens > 0) {
    try {
      await mutateTokenBalance(db, {
        playerId,
        delta: -config.rebuyCostTokens,
        reasonType: 'poker_tournament_rebuy',
        description: `Покерный турнир «${row.title}»: докупка`,
        sourceType: 'poker_tournament',
        sourceId: tournamentId,
        idempotencyKey: `poker-tournament-rebuy:${tournamentId}:${playerId}:${Number(entry.rebuys) + 1}`,
        debitPolicy: 'prevent_negative',
        actorType: 'player',
        actorId: playerId,
        metadata: { tournament_id: tournamentId, cost: config.rebuyCostTokens, chips: config.rebuyChips },
      });
    } catch (error) {
      if (error instanceof TokenInsufficientFundsError) throw new PokerTournamentError(409, `Для докупки нужно ${config.rebuyCostTokens.toLocaleString('ru-RU')} жетонов на балансе`);
      throw error;
    }
  }
  try { rebuyPoker(lobby, playerId, config.rebuyChips); }
  catch (error) { throw new PokerTournamentError(409, error instanceof Error ? error.message : 'Не получилось докупить'); }
  const seat = lobby.players.find((item) => item.id === playerId);
  if (seat) seat.sitting_out = false;
  await db.run('UPDATE poker_tournament_entries SET busted_at = NULL, busted_start_chips = 0, rebuys = rebuys + 1, updated_at = ? WHERE tournament_id = ? AND player_id = ?', [new Date(nowMs).toISOString(), tournamentId, playerId]);
  return getPokerTournamentRow(db, tournamentId);
}
