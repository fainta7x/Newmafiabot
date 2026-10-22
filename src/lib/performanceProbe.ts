/**
 * A tiny in-process record of what made the server slow: event-loop stalls, slow requests and slow database
 * transactions (owner report 2026-10-11, AUDIT_LOG: poker froze for 5–10 s and nothing on the server measured it).
 * No dependencies, so the database layer and the HTTP layer can both write to it. Only aggregates leave the process.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type SlowRequest = { at: string; route: string; status: number; ms: number };
export type SlowTransaction = { at: string; waited_ms: number; held_ms: number; origin: string };
export type LoopWindow = { at: string; max_ms: number; p99_ms: number; mean_ms: number };
/** A background job run: wall time and the part spent inside synchronous SQLite calls (that part blocks every request). */
export type SlowJob = { at: string; job: string; total_ms: number; sqlite_ms: number; sqlite_calls: number };

const WINDOW_MS = 5 * 60_000;
const KEEP = 40;
const slowRequests: SlowRequest[] = [];
const slowTransactions: SlowTransaction[] = [];
const loopWindows: LoopWindow[] = [];
const slowJobs: SlowJob[] = [];
/** Slow SQLite statements by their text (parameters are never stored): how often, the longest, the sum. */
const slowQueries = new Map<string, { sql: string; count: number; max_ms: number; total_ms: number; last_at: number }>();
export const SLOW_QUERY_MS = 50;
const MAX_SLOW_QUERY_SHAPES = 200;
const jobContext = new AsyncLocalStorage<{ sqliteMs: number; sqliteCalls: number }>();
type RouteLabel = string | (() => string);
const inFlight = new Map<number, { label: RouteLabel; startedAt: number }>();
const resolveLabel = (label: RouteLabel): string => { try { return typeof label === 'function' ? label() : label; } catch { return '(unknown)'; } };
let nextId = 1;

export const SLOW_REQUEST_MS = 1500;
let slowRequestMs = SLOW_REQUEST_MS;
/** Tests only: a request is recorded as slow from this many milliseconds. */
export const setSlowRequestThresholdForTesting = (ms: number = SLOW_REQUEST_MS) => { slowRequestMs = ms; };
export const SLOW_TRANSACTION_MS = 800;
export const SLOW_JOB_SQLITE_MS = 300;

const push = <T>(list: T[], item: T) => { list.push(item); if (list.length > KEEP) list.shift(); };
const recent = <T extends { at: string }>(list: T[], now: number) => list.filter((item) => now - Date.parse(item.at) <= WINDOW_MS);

/**
 * Only for a mount prefix or a route TEMPLATE (`/claim/:token`), never for a real request URL: a secret in a path
 * (a claim, confirmation or broadcast token) cannot be recognised by its shape. Ids that slip into a prefix are still masked.
 */
export const routeLabel = (method: string, path: string): string =>
  `${method} ${path.split('?')[0].replace(/\b[0-9a-f]{8}-[0-9a-f-]{20,}\b/gi, ':id').replace(/\b(?:ptr|pt|tr|ev)_[\w-]+/g, ':id').replace(/\/\d+(?=\/|$)/g, '/:id')}`;

/** `label` may be a function: the route template is only known after the router matched, so it is read late. */
export const requestStarted = (label: RouteLabel, now = Date.now()): number => {
  const id = nextId++;
  inFlight.set(id, { label, startedAt: now });
  return id;
};

export const requestFinished = (id: number, status: number, now = Date.now()) => {
  const started = inFlight.get(id);
  inFlight.delete(id);
  if (!started) return;
  const ms = now - started.startedAt;
  if (ms >= slowRequestMs) push(slowRequests, { at: new Date(now).toISOString(), route: resolveLabel(started.label), status, ms });
};

export const recordSlowTransaction = (waitedMs: number, heldMs: number, origin: string, now = Date.now()) => {
  if (waitedMs < SLOW_TRANSACTION_MS && heldMs < SLOW_TRANSACTION_MS) return;
  push(slowTransactions, { at: new Date(now).toISOString(), waited_ms: Math.round(waitedMs), held_ms: Math.round(heldMs), origin });
};

/** Called by the database wrapper after each synchronous statement; counted only inside a timed background job. */
export const addSqliteTime = (ms: number, sql?: string) => {
  if (sql && ms >= SLOW_QUERY_MS) recordSlowQuery(sql, ms);
  const store = jobContext.getStore();
  if (!store) return;
  store.sqliteMs += ms;
  store.sqliteCalls += 1;
};

/**
 * Runs one tick of a background worker and records it when its SQLite time blocked the server for
 * SLOW_JOB_SQLITE_MS or more (owner question 2026-10-22: what stalls the server for ~2 s every minute).
 */
export async function timeBackgroundJob<T>(job: string, run: () => Promise<T>, thresholdMs = SLOW_JOB_SQLITE_MS): Promise<T> {
  const store = { sqliteMs: 0, sqliteCalls: 0 };
  // A step timed inside a job (job/step) still counts towards the job around it.
  const outer = jobContext.getStore();
  const startedAt = performance.now();
  try {
    return await jobContext.run(store, run);
  } finally {
    if (outer) { outer.sqliteMs += store.sqliteMs; outer.sqliteCalls += store.sqliteCalls; }
    if (store.sqliteMs >= thresholdMs) {
      push(slowJobs, {
        at: new Date().toISOString(),
        job,
        total_ms: Math.round(performance.now() - startedAt),
        sqlite_ms: Math.round(store.sqliteMs),
        sqlite_calls: store.sqliteCalls,
      });
    }
  }
}

export const recordSlowQuery = (sql: string, ms: number, now = Date.now()) => {
  const text = sql.replace(/\s+/g, ' ').trim().slice(0, 240);
  const item = slowQueries.get(text);
  if (item) {
    item.count += 1; item.total_ms += ms; item.max_ms = Math.max(item.max_ms, ms); item.last_at = now;
    return;
  }
  if (slowQueries.size >= MAX_SLOW_QUERY_SHAPES) {
    const oldest = [...slowQueries.entries()].sort((a, b) => a[1].last_at - b[1].last_at)[0];
    if (oldest) slowQueries.delete(oldest[0]);
  }
  slowQueries.set(text, { sql: text, count: 1, max_ms: ms, total_ms: ms, last_at: now });
};

export const recordLoopWindow = (window: Omit<LoopWindow, 'at'>, now = Date.now()) => {
  push(loopWindows, { at: new Date(now).toISOString(), ...window });
};

/** The longest requests that are running right now: what the server is busy with while it feels stuck. */
export const requestsInFlight = (now = Date.now()) =>
  [...inFlight.values()].map((item) => ({ route: resolveLabel(item.label), running_ms: now - item.startedAt })).sort((a, b) => b.running_ms - a.running_ms).slice(0, 8);

export const performanceSnapshot = (now = Date.now()) => {
  const loop = recent(loopWindows, now);
  return {
    window_minutes: WINDOW_MS / 60_000,
    event_loop: {
      samples: loop.length,
      worst_stall_ms: loop.reduce((max, item) => Math.max(max, item.max_ms), 0),
      worst_p99_ms: loop.reduce((max, item) => Math.max(max, item.p99_ms), 0),
      recent: loop.slice(-10),
    },
    slow_requests: recent(slowRequests, now).sort((a, b) => b.ms - a.ms).slice(0, 10),
    slow_transactions: recent(slowTransactions, now).sort((a, b) => Math.max(b.held_ms, b.waited_ms) - Math.max(a.held_ms, a.waited_ms)).slice(0, 10),
    slow_jobs: recent(slowJobs, now).sort((a, b) => b.sqlite_ms - a.sqlite_ms).slice(0, 10),
    // Since the process started (not the 5-minute window): the statements that cost the most in total.
    slow_queries: [...slowQueries.values()]
      .sort((a, b) => b.total_ms - a.total_ms)
      .slice(0, 15)
      .map(({ sql, count, max_ms, total_ms }) => ({ sql, count, max_ms: Math.round(max_ms), total_ms: Math.round(total_ms) })),
    running_now: requestsInFlight(now),
  };
};

export const resetPerformanceProbeForTesting = () => {
  slowRequests.length = 0; slowTransactions.length = 0; loopWindows.length = 0; slowJobs.length = 0; slowQueries.clear(); inFlight.clear(); slowRequestMs = SLOW_REQUEST_MS;
};
