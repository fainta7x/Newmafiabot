import { Session } from 'node:inspector/promises';

/**
 * A short CPU profile of the running server, summarised (stall audit, 2026-10-22): the minute scans block the
 * event loop for ~2 s, and job timings cannot say which function does it because jobs overlap. The V8 sampling
 * profiler can: it shows the functions that held the CPU and the longest busy stretches with their stacks.
 * Read-only; one profile at a time; only aggregates leave the process.
 */

type ProfileNode = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] };
type Profile = { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] };

let running = false;

const IDLE = new Set(['(idle)', '(program)', '(garbage collector)']);

const frameName = (node: ProfileNode) => {
  const { functionName, url, lineNumber } = node.callFrame;
  const file = url.replace(/^file:\/\//, '').replace(/^.*?\/(src|node_modules|dist)\//, '$1/');
  return `${functionName || '(anonymous)'}${file ? ` ${file}:${lineNumber + 1}` : ''}`;
};

export function summariseCpuProfile(profile: Profile, top = 25) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children || []) parent.set(child, node.id);
  const stack = (id: number, depth = 8) => {
    const frames: string[] = [];
    for (let current: number | undefined = id; current !== undefined && frames.length < depth; current = parent.get(current)) {
      const node = byId.get(current);
      if (!node || node.callFrame.functionName === '(root)') break;
      frames.push(frameName(node));
    }
    return frames;
  };

  const selfMs = new Map<string, number>();
  let busyMs = 0;
  let totalMs = 0;
  // Busy stretches: consecutive samples that are not idle — the stalls.
  const stretches: Array<{ ms: number; hits: Map<number, number> }> = [];
  let currentStretch: { ms: number; hits: Map<number, number> } | null = null;
  profile.samples.forEach((id, index) => {
    const ms = (profile.timeDeltas[index + 1] ?? 0) / 1000;
    const node = byId.get(id);
    totalMs += ms;
    if (!node || IDLE.has(node.callFrame.functionName)) {
      if (currentStretch) stretches.push(currentStretch);
      currentStretch = null;
      return;
    }
    busyMs += ms;
    const name = frameName(node);
    selfMs.set(name, (selfMs.get(name) || 0) + ms);
    currentStretch ||= { ms: 0, hits: new Map() };
    currentStretch.ms += ms;
    currentStretch.hits.set(id, (currentStretch.hits.get(id) || 0) + ms);
  });
  if (currentStretch) stretches.push(currentStretch);

  const round = (ms: number) => Math.round(ms);
  return {
    sampled_ms: round(totalMs),
    busy_ms: round(busyMs),
    top_self: [...selfMs.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([fn, ms]) => ({ fn, ms: round(ms) })),
    longest_busy: stretches.sort((a, b) => b.ms - a.ms).slice(0, 5).map((stretch) => ({
      ms: round(stretch.ms),
      hottest: [...stretch.hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, ms]) => ({ ms: round(ms), stack: stack(id) })),
    })),
  };
}

export async function captureCpuProfile(seconds: number) {
  if (running) throw new Error('profile_running');
  running = true;
  const session = new Session();
  session.connect();
  try {
    await session.post('Profiler.enable');
    await session.post('Profiler.setSamplingInterval', { interval: 1000 });
    await session.post('Profiler.start');
    await new Promise((resolve) => { setTimeout(resolve, Math.max(1, Math.min(90, seconds)) * 1000); });
    const { profile } = await session.post('Profiler.stop') as { profile: Profile };
    return summariseCpuProfile(profile);
  } finally {
    session.disconnect();
    running = false;
  }
}
