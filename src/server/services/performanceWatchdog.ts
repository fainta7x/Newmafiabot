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

/** Measures every request; a slow one is kept (route without ids, status, time) for GET /api/health/performance. */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const id = requestStarted(routeLabel(req.method, req.originalUrl || req.url || ''));
  let done = false;
  const finish = () => { if (done) return; done = true; requestFinished(id, res.statusCode); };
  res.on('finish', finish);
  res.on('close', finish);
  next();
}
