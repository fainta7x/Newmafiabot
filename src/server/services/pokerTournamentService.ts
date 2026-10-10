import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePokerTournamentSchema } from '../../db/ensurePokerTournamentSchema.ts';
import {
  normalizePokerTournamentConfig, pokerTournamentClock, pokerTournamentRebuyOpen, type PokerTournamentConfig,
} from '../../shared/pokerTournament.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

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
    ? await db.get<{ status: string; rebuys: number; place: number | null }>('SELECT status, rebuys, place FROM poker_tournament_entries WHERE tournament_id = ? AND player_id = ?', [row.id, viewerId])
    : null;
  const clock = row.status === 'running' && row.started_at ? pokerTournamentClock(config, Date.parse(row.started_at), nowMs) : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    cancel_reason: row.cancel_reason,
    start_at: row.start_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    settings: config,
    players,
    spots_left: config.maxPlayers === null ? null : Math.max(0, config.maxPlayers - players),
    clock,
    rebuy_open: Boolean(clock && pokerTournamentRebuyOpen(config, clock)),
    my_entry: mine && mine.status !== 'cancelled' ? { status: mine.status, rebuys: Number(mine.rebuys), place: mine.place } : null,
  };
}

export async function createPokerTournament(db: DatabaseWrapper, organizerId: string | null, input: Record<string, unknown>, nowMs = Date.now()) {
  await ensurePokerTournamentSchema(db);
  const title = cleanText(input.title, 120);
  if (!title) throw new PokerTournamentError(400, 'Назовите турнир');
  const parsed = normalizePokerTournamentConfig(input, nowMs);
  if (!parsed.ok) throw new PokerTournamentError(400, parsed.error);
  const now = new Date(nowMs).toISOString();
  const id = `ptr_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO poker_tournaments (id, title, description, organizer_player_id, status, start_at, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'registration', ?, ?, ?, ?)`,
    [id, title, cleanText(input.description, 1000), organizerId, parsed.config.startAt, JSON.stringify(parsed.config), now, now],
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
