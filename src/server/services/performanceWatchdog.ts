import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { NextFunction, Request, Response } from 'express';
import { recordLoopWindow, requestFinished, requestStarted, requestsInFlight, routeLabel } from '../../lib/performanceProbe.ts';

const SAMPLE_EVERY_MS = 30_000;
const STALL_WARN_MS = 1000;
let histogram: IntervalHistogram | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/** Starts once per process. Every 30 s the worst event-loop delay of that window is stored; a stall of a second or more is also logged with what was running. */
export function startPerformanceWatchdog() {
  if (timer) return;
  histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  timer = setInterval(() => {
    if (!histogram) return;
    const max = histogram.max / 1e6;
    recordLoopWindow({ max_ms: Math.round(max), p99_ms: Math.round(histogram.percentile(99) / 1e6), mean_ms: Math.round(histogram.mean / 1e6) });
    if (max >= STALL_WARN_MS) {
      const running = requestsInFlight().slice(0, 4).map((item) => `${item.route} ${item.running_ms}ms`).join('; ') || 'none';
      console.warn(`[PERF] the event loop stalled for ${Math.round(max)} ms in the last ${SAMPLE_EVERY_MS / 1000} s; running now: ${running}`);
    }
    histogram.reset();
  }, SAMPLE_EVERY_MS);
  timer.unref?.();
}

/**
 * The name of a request for the record: the route TEMPLATE the router matched (`POST /api/player/poker/lobbies/:id/action`),
 * never the real URL, because a path can carry a secret token (claim, confirmation or broadcast links). A request that no
 * route matched is recorded without its path.
 */
export const requestRouteLabel = (req: Pick<Request, 'method' | 'baseUrl' | 'route'>): string => {
  const template = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof template !== 'string') return `${req.method} (no route)`;
  return routeLabel(req.method, `${req.baseUrl || ''}${template}`);
};

/** Measures every request; a slow one is kept (route template, status, time) for GET /api/health/performance. */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  // The template is only known after routing and can be reset when a router is left, so the last known one is kept.
  let known = `${req.method} (no route)`;
  const label = () => {
    const current = requestRouteLabel(req);
    if (!current.endsWith('(no route)')) known = current;
    return known;
  };
  const id = requestStarted(label);
  let done = false;
  const finish = () => { if (done) return; done = true; requestFinished(id, res.statusCode); };
  res.on('finish', finish);
  res.on('close', finish);
  next();
}
