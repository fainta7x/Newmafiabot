import { useEffect, useRef, useState } from 'react';

type AudioContextWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function useLiveGameClock() {
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerMax, setTimerMax] = useState(60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.004, context.currentTime + duration);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {
      // Audio feedback is best-effort and must not interrupt game control.
    }
  };

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
