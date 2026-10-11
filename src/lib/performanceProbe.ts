/**
 * A tiny in-process record of what made the server slow: event-loop stalls, slow requests and slow database
 * transactions (owner report 2026-10-11, AUDIT_LOG: poker froze for 5–10 s and nothing on the server measured it).
 * No dependencies, so the database layer and the HTTP layer can both write to it. Only aggregates leave the process.
 */
export type SlowRequest = { at: string; route: string; status: number; ms: number };
export type SlowTransaction = { at: string; waited_ms: number; held_ms: number; origin: string };
export type LoopWindow = { at: string; max_ms: number; p99_ms: number; mean_ms: number };

const WINDOW_MS = 5 * 60_000;
const KEEP = 40;
const slowRequests: SlowRequest[] = [];
const slowTransactions: SlowTransaction[] = [];
const loopWindows: LoopWindow[] = [];
const inFlight = new Map<number, { route: string; startedAt: number }>();
let nextId = 1;

export const SLOW_REQUEST_MS = 1500;
export const SLOW_TRANSACTION_MS = 800;

const push = <T>(list: T[], item: T) => { list.push(item); if (list.length > KEEP) list.shift(); };
const recent = <T extends { at: string }>(list: T[], now: number) => list.filter((item) => now - Date.parse(item.at) <= WINDOW_MS);

/** Ids, numbers and hashes in a path become `:id`, so the route is useful and carries no personal data. */
export const routeLabel = (method: string, path: string): string =>
  `${method} ${path.split('?')[0].replace(/\b[0-9a-f]{8}-[0-9a-f-]{20,}\b/gi, ':id').replace(/\b(?:ptr|pt|tr|ev)_[\w-]+/g, ':id').replace(/\/\d+(?=\/|$)/g, '/:id')}`;

export const requestStarted = (route: string, now = Date.now()): number => {
  const id = nextId++;
  inFlight.set(id, { route, startedAt: now });
  return id;
};

export const requestFinished = (id: number, status: number, now = Date.now()) => {
  const started = inFlight.get(id);
  inFlight.delete(id);
  if (!started) return;
  const ms = now - started.startedAt;
  if (ms >= SLOW_REQUEST_MS) push(slowRequests, { at: new Date(now).toISOString(), route: started.route, status, ms });
};

export const recordSlowTransaction = (waitedMs: number, heldMs: number, origin: string, now = Date.now()) => {
  if (waitedMs < SLOW_TRANSACTION_MS && heldMs < SLOW_TRANSACTION_MS) return;
  push(slowTransactions, { at: new Date(now).toISOString(), waited_ms: Math.round(waitedMs), held_ms: Math.round(heldMs), origin });
};

export const recordLoopWindow = (window: Omit<LoopWindow, 'at'>, now = Date.now()) => {
  push(loopWindows, { at: new Date(now).toISOString(), ...window });
};

/** The longest requests that are running right now: what the server is busy with while it feels stuck. */
export const requestsInFlight = (now = Date.now()) =>
  [...inFlight.values()].map((item) => ({ route: item.route, running_ms: now - item.startedAt })).sort((a, b) => b.running_ms - a.running_ms).slice(0, 8);

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
    running_now: requestsInFlight(now),
  };
};

export const resetPerformanceProbeForTesting = () => {
  slowRequests.length = 0; slowTransactions.length = 0; loopWindows.length = 0; inFlight.clear();
};
