import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEST_MOVE_SECONDS,
  resolvePersistedTimerDeadline,
} from '../components/LiveGameEngine/timerModel.js';

const read = (path: string) => readFileSync(path, 'utf8');

describe('first-killed best-move timer recovery', () => {
  it('reuses the persisted deadline instead of granting a fresh 25 seconds after restore', () => {
    const now = 1_000_000;
    const persisted = now + 13_000;
    expect(resolvePersistedTimerDeadline(persisted, now, BEST_MOVE_SECONDS)).toBe(persisted);
  });

  it('keeps an already expired restored deadline expired instead of restarting it', () => {
    const now = 1_000_000;
    const expired = now - 2_000;
    expect(resolvePersistedTimerDeadline(expired, now, BEST_MOVE_SECONDS)).toBe(expired);
  });

  it('creates one canonical deadline only when the session has no stored best-move deadline', () => {
    const now = 1_000_000;
    expect(resolvePersistedTimerDeadline(null, now, BEST_MOVE_SECONDS)).toBe(now + BEST_MOVE_SECONDS * 1000);
  });

  it('persists the deadline in the Live Game snapshot and feeds that restored value to CenterPanel', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    const stateModel = read('src/components/LiveGameEngine/engineStateModel.ts');
    const center = read('src/components/LiveGameEngine/CenterPanel.tsx');

    expect(stateModel).toContain('bestMoveDeadlineMs');
    expect(engine).toContain('bestMoveDeadlineMs');
    expect(engine).toContain('setBestMoveDeadlineMs(restored.bestMoveDeadlineMs)');
    expect(engine).toContain('bestMoveDeadlineMs,');
    expect(center).toContain('bestMoveDeadlineMs');
    expect(center).not.toContain('const deadline = createTimerDeadline(Date.now(), BEST_MOVE_SECONDS);');
  });
});
