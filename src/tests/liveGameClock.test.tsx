/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveGameClock } from '../components/LiveGameEngine/useLiveGameClock.ts';

function ClockHarness() {
  const clock = useLiveGameClock();

  return (
    <div>
      <span data-testid="time-left">{clock.timeLeft}</span>
      <span data-testid="timer-max">{clock.timerMax}</span>
      <span data-testid="running">{String(clock.isTimerRunning)}</span>
      <span data-testid="muted">{String(clock.isMuted)}</span>
      <button
        type="button"
        onClick={() => {
          clock.setTimeLeft(2);
          clock.setTimerMax(2);
          clock.setIsTimerRunning(true);
        }}
      >
        Start
      </button>
      <button
        type="button"
        onClick={() => {
          clock.setTimeLeft(12);
          clock.setTimerMax(12);
          clock.setIsTimerRunning(true);
        }}
      >
        Start12
      </button>
      <button
        type="button"
        onClick={() => {
          clock.setTimeLeft(10);
          clock.setTimerMax(10);
          clock.setIsTimerRunning(true);
        }}
      >
        Start10
      </button>
      <button type="button" onClick={() => clock.setIsTimerRunning((value) => !value)}>Toggle</button>
      <button type="button" onClick={() => clock.setIsMuted((value) => !value)}>Mute</button>
      <button type="button" onClick={() => clock.playBeep(500, 0.1)}>Beep</button>
    </div>
  );
}

describe('Live Game clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it('preserves initial clock state and stops exactly at zero', () => {
    render(<ClockHarness />);

    expect(screen.getByTestId('time-left').textContent).toBe('60');
    expect(screen.getByTestId('timer-max').textContent).toBe('60');
    expect(screen.getByTestId('running').textContent).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByTestId('time-left').textContent).toBe('2');
    expect(screen.getByTestId('running').textContent).toBe('true');

    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByTestId('time-left').textContent).toBe('1');
    expect(screen.getByTestId('running').textContent).toBe('true');

    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByTestId('time-left').textContent).toBe('0');
    expect(screen.getByTestId('running').textContent).toBe('false');

    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.getByTestId('time-left').textContent).toBe('0');
  });

  it('suppresses audio construction while muted', () => {
    let audioContexts = 0;
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      constructor() { audioContexts += 1; }
      createOscillator() {
        return {
          connect: vi.fn(),
          frequency: { value: 0 },
          start: vi.fn(),
          stop: vi.fn(),
        };
      }
      createGain() {
        return {
          connect: vi.fn(),
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
        };
      }
    }
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    });

    render(<ClockHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Beep' }));
    expect(audioContexts).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(screen.getByTestId('muted').textContent).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Beep' }));
    expect(audioContexts).toBe(1);
  });

  describe('speech timer beeps', () => {
    let beeps: Array<{ volume: number }>;
    let peaks: number[];
    beforeEach(() => {
      beeps = [];
      peaks = [];
      class FakeAudioContext {
        currentTime = 0;
        destination = {};
        createOscillator() { return { connect: vi.fn(), frequency: { value: 0 }, start: vi.fn(), stop: vi.fn() }; }
        createGain() {
          return { connect: vi.fn(), gain: { setValueAtTime: (value: number) => { beeps.push({ volume: value }); }, linearRampToValueAtTime: (value: number) => { peaks.push(value); }, exponentialRampToValueAtTime: vi.fn() } };
        }
      }
      (window as unknown as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
    });

    it('beeps softly when ten seconds are left and again when the speech ends', () => {
      render(<ClockHarness />);
      fireEvent.click(screen.getByRole('button', { name: 'Start12' }));
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(beeps).toHaveLength(0);
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(screen.getByTestId('time-left').textContent).toBe('10');
      expect(beeps).toHaveLength(1);
      act(() => { vi.advanceTimersByTime(9_000); });
      expect(beeps).toHaveLength(1);
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(screen.getByTestId('time-left').textContent).toBe('0');
      expect(beeps).toHaveLength(2);
      // soft chimes: well below the old 0.078 peak, with a fade-in rather than a hard start
      expect(peaks).toHaveLength(2);
      peaks.forEach((peak) => expect(peak).toBeLessThan(0.05));
    });

    it('does not repeat the warning when the clock is paused and resumed at ten seconds', () => {
      render(<ClockHarness />);
      fireEvent.click(screen.getByRole('button', { name: 'Start12' }));
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(beeps).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
      fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
      expect(screen.getByTestId('time-left').textContent).toBe('10');
      expect(beeps).toHaveLength(1);
    });

    it('a ten-second timer only beeps at the end, and a muted clock stays silent', () => {
      render(<ClockHarness />);
      fireEvent.click(screen.getByRole('button', { name: 'Start10' }));
      expect(beeps).toHaveLength(0);
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(beeps).toHaveLength(1);

      cleanup();
      beeps.length = 0;
      render(<ClockHarness />);
      fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start12' }));
      act(() => { vi.advanceTimersByTime(12_000); });
      expect(beeps).toHaveLength(0);
    });
  });
});
