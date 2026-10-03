import { useEffect, useRef, useState } from 'react';

type AudioContextWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

/** Speech timer sounds (owner, 2026-10-03): one beep when 10 seconds are left, one when the speech ends. */
export const SPEECH_WARNING_SECONDS = 10;
/** The beep is 30% louder than before (was 0.06). */
const BEEP_VOLUME = 0.078;
const BEEP_FLOOR = 0.0052;

export function useLiveGameClock() {
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerMax, setTimerMax] = useState(60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedRef = useRef(false);

  const playBeep = (freq: number, duration: number) => {
    if (isMuted) return;
    try {
      const AudioContextCtor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(BEEP_VOLUME, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(BEEP_FLOOR, context.currentTime + duration);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {
      // Audio feedback is best-effort and must not interrupt game control.
    }
  };

  // The warning beep: once per countdown, when exactly ten seconds are left. A timer that is only ten
  // seconds long (or shorter) has nothing to warn about, and pausing/resuming at ten never repeats it.
  useEffect(() => {
    if (timeLeft > SPEECH_WARNING_SECONDS) {
      warnedRef.current = false;
      return;
    }
    if (isTimerRunning && timeLeft === SPEECH_WARNING_SECONDS && timerMax > SPEECH_WARNING_SECONDS && !warnedRef.current) {
      warnedRef.current = true;
      playBeep(1000, 0.4);
    }
  }, [timeLeft, isTimerRunning, timerMax, isMuted]);

  useEffect(() => {
    if (!isTimerRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          setIsTimerRunning(false);
          playBeep(1000, 0.4);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, isMuted]);

  return {
    timeLeft,
    setTimeLeft,
    timerMax,
    setTimerMax,
    isTimerRunning,
    setIsTimerRunning,
    isMuted,
    setIsMuted,
    playBeep,
  };
}
