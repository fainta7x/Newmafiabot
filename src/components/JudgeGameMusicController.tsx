import { useEffect, useRef, useState } from 'react';
import { useJudgeGameMusic } from '../hooks/useJudgeGameMusic.ts';
import { recoverInterruptedTestGameSandbox } from '../lib/testGameSandbox.ts';

const START_EVENT = 'judge-game-music-start';
const STOP_EVENT = 'judge-game-music-stop';

export const requestJudgeGameMusicStart = () => window.dispatchEvent(new CustomEvent(START_EVENT));
export const requestJudgeGameMusicStop = () => window.dispatchEvent(new CustomEvent(STOP_EVENT));

const readLivePhase = () => {
  try {
    const raw = localStorage.getItem('mafia_live_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.phase === 'string' ? parsed.phase : null;
  } catch {
    return null;
  }
};

const hasOpenLiveEngine = () => Boolean(
  document.querySelector('.evening-live-engine-shell, .tournament-live-shell')
);

export default function JudgeGameMusicController() {
  const music = useJudgeGameMusic();
  const [manualDeal, setManualDeal] = useState(false);
  const [nightWanted, setNightWanted] = useState(false);
  const manualRef = useRef(false);
  const wantedRef = useRef(false);

  useEffect(() => {
    recoverInterruptedTestGameSandbox();
  }, []);

  useEffect(() => { manualRef.current = manualDeal; }, [manualDeal]);
  useEffect(() => { wantedRef.current = manualDeal || nightWanted; }, [manualDeal, nightWanted]);

  useEffect(() => {
    const startDeal = () => {
      manualRef.current = true;
      setManualDeal(true);
      void music.start();
    };
    const stopDeal = () => {
      manualRef.current = false;
      setManualDeal(false);
      if (!nightWanted) music.stop();
    };
    window.addEventListener(START_EVENT, startDeal);
    window.addEventListener(STOP_EVENT, stopDeal);
    return () => {
      window.removeEventListener(START_EVENT, startDeal);
      window.removeEventListener(STOP_EVENT, stopDeal);
    };
  }, [music.start, music.stop, nightWanted]);

  useEffect(() => {
    const sync = () => {
      const phase = hasOpenLiveEngine() ? readLivePhase() : null;
      const shouldPlayForNight = phase === 'zero_night' || phase === 'night';
      setNightWanted((current) => current === shouldPlayForNight ? current : shouldPlayForNight);

      const shouldPlay = manualRef.current || shouldPlayForNight;
      wantedRef.current = shouldPlay;
      if (shouldPlay) {
        if (!music.playing && music.tracks.length) void music.start();
      } else if (music.playing) {
        music.stop();
      }
    };

    sync();
    const interval = window.setInterval(sync, 350);
    return () => window.clearInterval(interval);
  }, [music.playing, music.start, music.stop, music.tracks.length]);

  useEffect(() => () => music.stop(), [music.stop]);

  if (!music.blocked || !wantedRef.current || !music.tracks.length) return null;

  return (
    <button
      type="button"
      onClick={() => void music.start()}
      className="fixed bottom-24 right-3 z-[190] rounded-2xl border border-violet-300/25 bg-[#17131d]/95 px-4 py-3 text-left shadow-2xl backdrop-blur-xl"
    >
      <div className="text-xs font-black text-violet-100">♫ Включить музыку</div>
      <div className="mt-0.5 text-[10px] text-violet-100/45">Браузер заблокировал автозапуск · нажмите один раз</div>
    </button>
  );
}
