import type { Request, Response, NextFunction } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { timeBackgroundJob } from '../../lib/performanceProbe.ts';

/**
 * «Экраны без подгрузки» (owner, 2026-11-17: «чтобы сразу информация показывалась без прогрузок, а прогрузки совершались
 * независимо от того, зашёл ли человек»). The heavy organizer screens (Сегодня, Дела, Обзор) are computed in the background
 * every minute and kept in memory; a request gets the ready answer. Any change through the API (every non-GET request)
 * makes the stored answers old at once, so nobody sees data from before their own action, and a fresh computation starts
 * with the next minute check (not at once: 2026-11-17 a recompute after every request — presence pings every 15 s from
 * each open app, sudoku moves — kept the server busy 30% of the time; the event loop stalled for seconds and players were
 * thrown out of the app). Requests that cannot change these screens do not make them old. Changes made by background
 * workers reach the screens within 5 minutes.
 */
export const SCREEN_MAX_AGE_MS = 5 * 60_000;
const CHECK_EVERY_MS = 60_000;
/** Non-GET requests that never change «Сегодня», «Дела» or «Обзор» (telemetry and mini-games). */
const IGNORED_WRITES = [
  '/api/presence', '/api/ui-events', '/api/games/betting/reconcile',
  '/api/player/daily-sudoku', '/api/player/daily-word', '/api/player/telephone', '/api/player/santa', '/api/player/poker', '/api/poker', '/api/clocktower',
];
export const screenChangingRequest = (method: string, path: string) => !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
  && !IGNORED_WRITES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));

type Entry = { value: unknown; generation: number; computedAt: number };
type DbState = { generation: number; entries: Map<string, Entry>; inflight: Map<string, { generation: number; promise: Promise<unknown> }>; warmedGeneration: number; warmedAt: number };

const states = new WeakMap<DatabaseWrapper, DbState>();
const computers = new Map<string, (db: DatabaseWrapper) => Promise<unknown>>();

const stateOf = (db: DatabaseWrapper) => {
  let state = states.get(db);
  if (!state) { state = { generation: 0, entries: new Map(), inflight: new Map(), warmedGeneration: -1, warmedAt: 0 }; states.set(db, state); }
  return state;
};

/** Registers a screen that the minute warm-up and the after-change recompute keep ready. */
export function registerScreen(key: string, compute: (db: DatabaseWrapper) => Promise<unknown>) {
  computers.set(key, compute);
}

const compute = (db: DatabaseWrapper, key: string, fn: (db: DatabaseWrapper) => Promise<unknown>) => {
  const state = stateOf(db);
  const running = state.inflight.get(key);
  if (running && running.generation === state.generation) return running.promise;
  const generation = state.generation;
  const promise = timeBackgroundJob(`screens/${key}`, () => fn(db), 300).then((value) => {
    // A change that came while this was computing makes the result old already: it is returned but not kept.
    if (state.generation === generation) state.entries.set(key, { value, generation, computedAt: Date.now() });
    return value;
  }).finally(() => {
    if (state.inflight.get(key)?.promise === promise) state.inflight.delete(key);
  });
  state.inflight.set(key, { generation, promise });
  return promise;
};

/** The ready answer when it is current, otherwise computes it now (and keeps it for the next request). */
export async function cachedScreen<T>(db: DatabaseWrapper, key: string, fn: (db: DatabaseWrapper) => Promise<T>, now = Date.now()): Promise<T> {
  const state = stateOf(db);
  const entry = state.entries.get(key);
  if (entry && entry.generation === state.generation && now - entry.computedAt <= SCREEN_MAX_AGE_MS) return entry.value as T;
  return compute(db, key, fn) as Promise<T>;
}

/** Recomputes every registered screen, one after another (SQLite blocks the server while it reads); one failing screen does not stop the others. */
export async function warmScreens(db: DatabaseWrapper, now = Date.now()) {
  const state = stateOf(db);
  state.warmedGeneration = state.generation;
  state.warmedAt = now;
  for (const [key, fn] of computers) {
    await compute(db, key, fn).catch((error) => {
      console.warn(`[SCREENS] ${key} warm-up failed:`, error instanceof Error ? error.message : String(error));
    });
  }
}

/** The minute check: recompute only after a change, or when the stored screens are about to be too old. */
export async function warmScreensIfNeeded(db: DatabaseWrapper, now = Date.now()) {
  const state = stateOf(db);
  const changed = state.warmedGeneration !== state.generation;
  const ageing = now - state.warmedAt >= SCREEN_MAX_AGE_MS - CHECK_EVERY_MS;
  if (!changed && !ageing) return false;
  await warmScreens(db, now);
  return true;
}

/** Marks every stored screen of this database old; the next request or the next minute check computes them again. */
export function invalidateScreens(db: DatabaseWrapper) {
  const state = stateOf(db);
  state.generation += 1;
  state.entries.clear();
}

/** After a finished request that may change data, the stored screens of its database are old. */
export function screenInvalidationMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!screenChangingRequest(req.method, req.originalUrl || req.path)) return next();
  const db = (req as any).db as DatabaseWrapper | undefined;
  if (db) {
    // Invalidate at once (a read sent right after the change must not get the old answer) and once more when the
    // change is finished, so a computation that started in between is not kept.
    invalidateScreens(db);
    res.on('finish', () => invalidateScreens(db));
  }
  return next();
}

/** Keeps the club database's screens ready, whether anyone opens them or not: a check every minute. */
export function startScreenPrecomputeWorker(db: DatabaseWrapper) {
  void warmScreens(db);
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void warmScreensIfNeeded(db).finally(() => { running = false; });
  }, CHECK_EVERY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
