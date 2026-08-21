import { useEffect, useRef } from 'react';
import { useJudgeGameMusic } from '../hooks/useJudgeGameMusic.ts';
import { readJudgeGameMusicSelection } from '../lib/judgeGameMusicSelection.ts';
import { recoverInterruptedTestGameSandbox } from '../lib/testGameSandbox.ts';

const START_EVENT = 'judge-game-music-start';
const STOP_EVENT = 'judge-game-music-stop';
const MANUAL_STATE_KEY = 'judge-game-music-manual-state-v1';

type MusicStartKind = 'manual' | 'night';
type MusicStartDetail = { trackId?: string; kind?: MusicStartKind };
type StoredManualState = { trackId?: string; kind: MusicStartKind };

const readStoredManualState = (): StoredManualState | null => {
  try {
    const raw = sessionStorage.getItem(MANUAL_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.kind !== 'manual' && parsed?.kind !== 'night') return null;
    return {
      kind: parsed.kind,
      trackId: typeof parsed.trackId === 'string' && parsed.trackId ? parsed.trackId : undefined,
    };
  } catch {
    return null;
  }
};

const storeManualState = (detail: MusicStartDetail) => {
  try {
    sessionStorage.setItem(MANUAL_STATE_KEY, JSON.stringify({
      kind: detail.kind === 'night' ? 'night' : 'manual',
      trackId: detail.trackId || undefined,
    }));
  } catch {}
};

const clearManualState = () => {
  try { sessionStorage.removeItem(MANUAL_STATE_KEY); } catch {}
};

export const requestJudgeGameMusicStart = (trackId?: string) => window.dispatchEvent(
  new CustomEvent<MusicStartDetail>(START_EVENT, { detail: { trackId, kind: 'manual' } }),
);

export const requestJudgeNightMusicStart = () => {
  const selection = readJudgeGameMusicSelection();
  if (selection?.configured === true && !selection.nightTrackId) {
    window.dispatchEvent(new CustomEvent(STOP_EVENT));
    return false;
  }
  const trackId = selection?.configured === true ? selection.nightTrackId || undefined : undefined;
  window.dispatchEvent(new CustomEvent<MusicStartDetail>(START_EVENT, { detail: { trackId, kind: 'night' } }));
  return true;
};

export const requestJudgeGameMusicStop = () => window.dispatchEvent(new CustomEvent(STOP_EVENT));

export default function JudgeGameMusicController() {
  const music = useJudgeGameMusic();
  const manualRef = useRef(false);
  const manualTrackRef = useRef<string | undefined>(undefined);
  const wantedRef = useRef(false);
  const wantedTrackRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    recoverInterruptedTestGameSandbox();
    const stored = readStoredManualState();
    if (stored) {
      manualRef.current = true;
      manualTrackRef.current = stored.trackId;
      wantedRef.current = true;
      wantedTrackRef.current = stored.trackId;
    }
  }, []);

  useEffect(() => {
    const startDeal = (event: Event) => {
      const detail = (event as CustomEvent<MusicStartDetail>).detail || {};
      manualRef.current = true;
      manualTrackRef.current = detail.trackId;
      wantedRef.current = true;
      wantedTrackRef.current = detail.trackId;
      storeManualState(detail);
      void music.start(detail.trackId);
    };
    const stopDeal = () => {
      manualRef.current = false;
      manualTrackRef.current = undefined;
      wantedRef.current = false;
      wantedTrackRef.current = undefined;
      clearManualState();
      // Explicit stop always wins immediately. Night phase state must never
      // restart music after the judge has pressed the stop step.
      music.stop();
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
      // A judge-started track is sticky across Telegram/WebView remounts while
      // the game is open. It can only be cleared by the explicit STOP event.
      if (!manualRef.current) {
        const stored = readStoredManualState();
        if (stored) {
          manualRef.current = true;
          manualTrackRef.current = stored.trackId;
        }
      }

      const shouldPlay = manualRef.current;
      const desiredTrack = manualTrackRef.current;
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
      <div className="mt-0.5 text-[10px] text-violet-100/45">Браузер заблокировал запуск · нажмите один раз</div>
    </button>
  );
}
