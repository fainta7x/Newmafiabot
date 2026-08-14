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

type LiveAudioState = {
  phase: string | null;
  zeroNightSubPhase: string | null;
  nightSubPhase: string | null;
  sheriffCheckSlot: number | null;
};

const readLiveAudioState = (): LiveAudioState | null => {
  try {
    const raw = localStorage.getItem('mafia_live_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      phase: typeof parsed?.phase === 'string' ? parsed.phase : null,
      zeroNightSubPhase: typeof parsed?.zeroNightSubPhase === 'string' ? parsed.zeroNightSubPhase : null,
      nightSubPhase: typeof parsed?.nightSubPhase === 'string' ? parsed.nightSubPhase : null,
      sheriffCheckSlot: Number.isFinite(Number(parsed?.sheriffCheckSlot)) && parsed?.sheriffCheckSlot !== null
        ? Number(parsed.sheriffCheckSlot)
        : null,
    };
  } catch {
    return null;
  }
};

const hasOpenLiveEngine = () => Boolean(
  document.querySelector('.evening-live-engine-shell, .tournament-live-shell')
);

const zeroNightWantsMusic = (live: LiveAudioState | null) => {
  if (live?.phase !== 'zero_night') return false;
  return live.zeroNightSubPhase === 'agreement'
    || live.zeroNightSubPhase === 'sheriff'
    || live.zeroNightSubPhase === 'seating';
};

export default function JudgeGameMusicController() {
  const music = useJudgeGameMusic();
  const manualRef = useRef(false);
  const manualTrackRef = useRef<string | undefined>(undefined);
  const nightWantedRef = useRef(false);
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
      // Explicit stop always wins immediately. No timer or night subphase is
      // allowed to masquerade as the judge pressing this button.
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
      const live = hasOpenLiveEngine() ? readLiveAudioState() : null;
      const selection = readJudgeGameMusicSelection();

      // A manually started regular-night track is sticky. Rehydrate the flag if
      // Telegram/WebView remounted this controller while the game was still open.
      // It can only be cleared by the explicit STOP event above.
      if (!manualRef.current) {
        const stored = readStoredManualState();
        if (stored) {
          manualRef.current = true;
          manualTrackRef.current = stored.trackId;
        }
      }

      const phaseWantsNightMusic = zeroNightWantsMusic(live);
      const configured = selection?.configured === true;
      const selectedNightTrack = configured ? selection.nightTrackId || undefined : undefined;
      const shouldPlayForZeroNight = phaseWantsNightMusic && (!configured || Boolean(selectedNightTrack));

      nightWantedRef.current = shouldPlayForZeroNight;
      const shouldPlay = manualRef.current || shouldPlayForZeroNight;
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
      <div className="mt-0.5 text-[10px] text-violet-100/45">Браузер заблокировал запуск · нажмите один раз</div>
    </button>
  );
}
