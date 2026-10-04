import { useEffect, useRef, useState } from 'react';

type AudioContextWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

/** Speech timer sounds (owner, 2026-10-03): one beep when 10 seconds are left, one when the speech ends. */
export const SPEECH_WARNING_SECONDS = 10;
/** Owner, 2026-10-03: the beeps were harsh — now soft sine chimes with a gentle attack, about half as loud (was 0.078). */
const BEEP_VOLUME = 0.035;
const BEEP_FLOOR = 0.0008;
const BEEP_ATTACK_SECONDS = 0.04;
/** Warning: a light higher note; end of speech: a lower, longer note. */
const WARNING_TONE = { freq: 660, duration: 0.5 };
const END_TONE = { freq: 523, duration: 0.8 };

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
      oscillator.type = 'sine';
      oscillator.frequency.value = freq;
      // Fade in and out instead of switching on abruptly — that click is what made the old beep sharp.
      gain.gain.setValueAtTime(BEEP_FLOOR, context.currentTime);
      gain.gain.linearRampToValueAtTime(BEEP_VOLUME, context.currentTime + BEEP_ATTACK_SECONDS);
      gain.gain.exponentialRampToValueAtTime(BEEP_FLOOR, context.currentTime + duration);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {
      // Audio feedback is best-effort and must not interrupt game control.
    }
  };

  // The warning beep: once per countdown, when ten seconds are reached. A catch-up step after the page was in the
  // background can jump from above ten to below it, so the crossing is detected, not only the exact value. A timer
  // that is only ten seconds long (or shorter) has nothing to warn about, and pausing/resuming at ten never repeats it.
  const previousTimeLeftRef = useRef(timeLeft);
  useEffect(() => {
    const previous = previousTimeLeftRef.current;
    previousTimeLeftRef.current = timeLeft;
    if (timeLeft > SPEECH_WARNING_SECONDS) {
      warnedRef.current = false;
      return;
    }
    const reachedWarning = timeLeft === SPEECH_WARNING_SECONDS || (previous > SPEECH_WARNING_SECONDS && timeLeft > 0);
    if (isTimerRunning && reachedWarning && timerMax > SPEECH_WARNING_SECONDS && !warnedRef.current) {
      warnedRef.current = true;
      playBeep(WARNING_TONE.freq, WARNING_TONE.duration);
    }
  }, [timeLeft, isTimerRunning, timerMax, isMuted]);

  useEffect(() => {
    if (!isTimerRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Count real elapsed seconds, not ticks: a backgrounded Telegram WebApp throttles intervals and a tick counter lags
    // behind the clock (engine audit, 2026-10-04).
    let lastTickAt = Date.now();
    const tick = () => {
      const now = Date.now();
      const elapsed = Math.max(1, Math.floor((now - lastTickAt) / 1000));
      lastTickAt += elapsed * 1000;
      setTimeLeft((value) => {
        if (value <= elapsed) {
          setIsTimerRunning(false);
          playBeep(END_TONE.freq, END_TONE.duration);
          return 0;
        }
        return value - elapsed;
      });
    };
    timerRef.current = setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastTickAt >= 1000) tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
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
