import type { Request, Response, NextFunction } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * «Экраны без подгрузки» (owner, 2026-11-17: «чтобы сразу информация показывалась без прогрузок, а прогрузки совершались
 * независимо от того, зашёл ли человек»). The heavy organizer screens (Сегодня, Дела, Обзор) are computed in the background
 * every minute and kept in memory; a request gets the ready answer. Any change through the API (every non-GET request)
 * makes the stored answers old at once, so nobody sees data from before their own action, and a fresh computation starts
 * right after it. Changes made by background workers (sent messages, reminders) reach the screens within a minute.
 */
export const SCREEN_MAX_AGE_MS = 90_000;
const RECOMPUTE_AFTER_CHANGE_MS = 1_500;
const WARM_EVERY_MS = 60_000;

type Entry = { value: unknown; generation: number; computedAt: number };
type DbState = { generation: number; entries: Map<string, Entry>; inflight: Map<string, { generation: number; promise: Promise<unknown> }>; timer: ReturnType<typeof setTimeout> | null };

const states = new WeakMap<DatabaseWrapper, DbState>();
const computers = new Map<string, (db: DatabaseWrapper) => Promise<unknown>>();

const stateOf = (db: DatabaseWrapper) => {
  let state = states.get(db);
  if (!state) { state = { generation: 0, entries: new Map(), inflight: new Map(), timer: null }; states.set(db, state); }
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
  const promise = fn(db).then((value) => {
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

/** Recomputes every registered screen; one failing screen does not stop the others. */
export async function warmScreens(db: DatabaseWrapper) {
  await Promise.all([...computers].map(([key, fn]) => compute(db, key, fn).catch((error) => {
    console.warn(`[SCREENS] ${key} warm-up failed:`, error instanceof Error ? error.message : String(error));
  })));
}

/** Marks every stored screen of this database old and recomputes them shortly after (several changes in a row → one recompute). */
export function invalidateScreens(db: DatabaseWrapper, { recompute = true } = {}) {
  const state = stateOf(db);
  state.generation += 1;
  state.entries.clear();
  if (!recompute || !computers.size) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => { state.timer = null; void warmScreens(db); }, RECOMPUTE_AFTER_CHANGE_MS);
  state.timer.unref?.();
}

/** After every finished non-GET API request the stored screens of its database are old. */
export function screenInvalidationMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const db = (req as any).db as DatabaseWrapper | undefined;
  if (db) {
    // Invalidate at once (a read sent right after the change must not get the old answer) and once more when the
    // change is finished, so a computation that started in between is not kept.
    invalidateScreens(db, { recompute: false });
    res.on('finish', () => invalidateScreens(db));
  }
  return next();
}

/** Keeps the club database's screens ready every minute, whether anyone opens them or not. */
export function startScreenPrecomputeWorker(db: DatabaseWrapper) {
  void warmScreens(db);
  const timer = setInterval(() => { void warmScreens(db); }, WARM_EVERY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
