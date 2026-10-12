// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePokerSoundEffects } from '../components/player/PokerSoundToggle.tsx';

const resume = vi.fn(() => Promise.resolve());

beforeEach(() => {
  window.localStorage.clear();
  resume.mockClear();
  class FakeAudio { state = 'suspended'; currentTime = 0; resume = resume; }
  (window as any).AudioContext = FakeAudio;
});
afterEach(() => { cleanup(); delete (window as any).AudioContext; });

describe('poker sounds', () => {
  it('are on by default, so a table is not silent until the player finds the speaker', () => {
    const { result } = renderHook(() => usePokerSoundEffects('t1', null));
    expect(result.current.enabled).toBe(true);
  });

  it('stay off when the player switched them off', () => {
    window.localStorage.setItem('2la-poker-sound-enabled', 'off');
    const { result } = renderHook(() => usePokerSoundEffects('t1', null));
    expect(result.current.enabled).toBe(false);
  });

  it('unlock the audio engine on the first tap, so a remembered «on» works after a reload', () => {
    renderHook(() => usePokerSoundEffects('t1', null));
    resume.mockClear();
    window.dispatchEvent(new Event('pointerdown'));
    expect(resume).toHaveBeenCalled();
  });
});
