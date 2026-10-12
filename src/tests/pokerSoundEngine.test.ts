import { describe, expect, it } from 'vitest';
import { playPokerCue } from '../lib/pokerSoundEngine.ts';
import type { PokerSoundCue } from '../lib/pokerSound.ts';

/** A stand-in for AudioContext that only records which nodes were started. */
const fakeContext = () => {
  const started: string[] = [];
  const param = () => ({ value: 0, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined });
  const node = (kind: string, extra: Record<string, unknown> = {}) => {
    const self: any = { ...extra, connect: (next: unknown) => next, start: () => { started.push(kind); }, stop: () => undefined };
    return self;
  };
  const ctx: any = {
    currentTime: 0, sampleRate: 8000, destination: node('destination'),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => node('noise'),
    createBiquadFilter: () => node('filter', { Q: param(), frequency: param(), type: 'bandpass' }),
    createGain: () => node('gain', { gain: param() }),
    createOscillator: () => node('osc', { frequency: param(), type: 'sine' }),
    createDynamicsCompressor: () => node('compressor', { threshold: param(), ratio: param(), attack: param(), release: param() }),
  };
  return { ctx, started };
};

const CUES: PokerSoundCue[] = ['deal', 'board', 'chips', 'chipsBig', 'check', 'fold', 'sweep', 'turn', 'timer', 'win'];

describe('poker sound engine', () => {
  it.each(CUES)('builds the %s cue without errors and starts some sound', (cue) => {
    const { ctx, started } = fakeContext();
    expect(() => playPokerCue(ctx, cue)).not.toThrow();
    expect(started.length).toBeGreaterThan(0);
  });

  it('makes a raise heavier than a call, and a win longer than a single chip', () => {
    const count = (cue: PokerSoundCue) => { const { ctx, started } = fakeContext(); playPokerCue(ctx, cue); return started.length; };
    expect(count('chipsBig')).toBeGreaterThan(count('chips'));
    expect(count('win')).toBeGreaterThan(count('chips'));
  });
});
