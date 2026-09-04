import { describe, expect, it } from 'vitest';
import {
  BEST_MOVE_SECONDS,
  DEATH_PROTOCOL_SECONDS,
  REVOTE_SPEECH_SECONDS,
  buildTimerIdentity,
  createTimerDeadline,
  getRemainingTimerSeconds,
  resolveTimerDuration,
} from '../components/LiveGameEngine/timerModel.js';

describe('Live Game timer model', () => {
  it('forces revote speeches to the existing 30-second limit', () => {
    expect(resolveTimerDuration('day_voting', 'revote_speeches', 60)).toBe(REVOTE_SPEECH_SECONDS);
    expect(resolveTimerDuration('day_voting', 'revote_speeches', 10)).toBe(REVOTE_SPEECH_SECONDS);
  });

  it('preserves requested duration outside revote speeches', () => {
    expect(resolveTimerDuration('day_speeches', 'setup', 60)).toBe(60);
    expect(resolveTimerDuration('night', 'resolved', BEST_MOVE_SECONDS)).toBe(BEST_MOVE_SECONDS);
  });

  it('keeps the approved announcement-buffer totals for best move and killed-player protocol', () => {
    expect(BEST_MOVE_SECONDS).toBe(25);
    expect(DEATH_PROTOCOL_SECONDS).toBe(20);
  });

  it('builds a stable identity from the same timer inputs', () => {
    expect(buildTimerIdentity('day_voting', 'revote_speeches', 4, 'Спорная речь', 30))
      .toBe('day_voting|revote_speeches|4|Спорная речь|30');
    expect(buildTimerIdentity('night', 'setup', null, null, 60))
      .toBe('night|setup|||60');
  });

  it('creates non-negative deadlines and rounds remaining seconds upward', () => {
    expect(createTimerDeadline(1_000, 20)).toBe(21_000);
    expect(createTimerDeadline(1_000, -5)).toBe(1_000);
    expect(getRemainingTimerSeconds(21_000, 1_001)).toBe(20);
    expect(getRemainingTimerSeconds(21_000, 20_001)).toBe(1);
    expect(getRemainingTimerSeconds(21_000, 21_001)).toBe(0);
  });
});
