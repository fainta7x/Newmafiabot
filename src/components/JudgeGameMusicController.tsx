import { useEffect, useRef } from 'react';
import { useJudgeGameMusic } from '../hooks/useJudgeGameMusic.ts';
import { readJudgeGameMusicSelection } from '../lib/judgeGameMusicSelection.ts';
import { recoverInterruptedTestGameSandbox } from '../lib/testGameSandbox.ts';

const START_EVENT = 'judge-game-music-start';
const STOP_EVENT = 'judge-game-music-stop';

export const requestJudgeGameMusicStart = (trackId?: string) => window.dispatchEvent(
  new CustomEvent(START_EVENT, { detail: { trackId } }),
);
export const requestJudgeGameMusicStop = () => window.dispatchEvent(new CustomEvent(STOP_EVENT));

type LiveAudioState = {
  phase: string | null;
  zeroNightSubPhase: string | null;
  isTimerRunning: boolean;
};

const readLiveAudioState = (): LiveAudioState | null => {
  try {
    const raw = localStorage.getItem('mafia_live_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      phase: typeof parsed?.phase === 'string' ? parsed.phase : null,
      zeroNightSubPhase: typeof parsed?.zeroNightSubPhase === 'string' ? parsed.zeroNightSubPhase : null,
      isTimerRunning: parsed?.isTimerRunning === true,
    };
  } catch {
    return null;
  }
};

const hasOpenLiveEngine = () => Boolean(
  document.querySelector('.evening-live-engine-shell, .tournament-live-shell')
);

export default function JudgeGameMusicController() {
  const music = useJudgeGameMusic();
  const manualRef = useRef(false);
  const manualTrackRef = useRef<string | undefined>(undefined);
  const nightWantedRef = useRef(false);
  const wantedRef = useRef(false);
  const wantedTrackRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    recoverInterruptedTestGameSandbox();
  }, []);

  useEffect(() => {
    const startDeal = (event: Event) => {
      const detail = (event as CustomEvent<{ trackId?: string }>).detail;
      manualRef.current = true;
      manualTrackRef.current = detail?.trackId;
      wantedRef.current = true;
      wantedTrackRef.current = detail?.trackId;
      void music.start(detail?.trackId);
    };
    const stopDeal = () => {
      manualRef.current = false;
      manualTrackRef.current = undefined;
      if (!nightWantedRef.current) music.stop();
    };
    window.addEventListener(START_EVENT, startDeal);
    window.addEventListener(STOP_EVENT, stopDeal);
    return () => {
      window.removeEventListener(START_EVENT, startDeal);
      window.removeEventListener(STOP_EVENT, stopDeal);
    };
  }, [music.start, music.stop]);

  useEffect(() => {
    const sync = () => {
      const live = hasOpenLiveEngine() ? readLiveAudioState() : null;
      const selection = readJudgeGameMusicSelection();
      const agreementWanted = live?.phase === 'zero_night'
        && live.zeroNightSubPhase === 'agreement'
        && live.isTimerRunning;
      const regularNightWanted = live?.phase === 'night';
      const phaseWantsNightMusic = agreementWanted || regularNightWanted;
      const configured = selection?.configured === true;
      const selectedNightTrack = configured ? selection.nightTrackId || undefined : undefined;
      const shouldPlayForNight = phaseWantsNightMusic && (!configured || Boolean(selectedNightTrack));

      nightWantedRef.current = shouldPlayForNight;
      const shouldPlay = manualRef.current || shouldPlayForNight;
      const desiredTrack = manualRef.current ? manualTrackRef.current : selectedNightTrack;
      wantedRef.current = shouldPlay;
      wantedTrackRef.current = desiredTrack;

      if (shouldPlay) {
        if (music.tracks.length && !music.blocked) void music.start(desiredTrack);
      } else {
        music.stop();
      }
    };

    sync();
    const interval = window.setInterval(sync, 350);
    return () => window.clearInterval(interval);
  }, [music.blocked, music.start, music.stop, music.tracks.length]);

  useEffect(() => () => music.stop(), [music.stop]);

  if (!music.blocked || !wantedRef.current || !music.tracks.length) return null;

  return (
    <button
      type="button"
      onClick={() => void music.start(wantedTrackRef.current)}
      className="fixed bottom-24 right-3 z-[190] rounded-2xl border border-violet-300/25 bg-[#17131d]/95 px-4 py-3 text-left shadow-2xl backdrop-blur-xl"
    >
      <div className="text-xs font-black text-violet-100">♫ Включить музыку</div>
      <div className="mt-0.5 text-[10px] text-violet-100/45">Браузер заблокировал автозапуск · нажмите один раз</div>
    </button>
  );
}
