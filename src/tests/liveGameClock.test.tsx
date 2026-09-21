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
});
