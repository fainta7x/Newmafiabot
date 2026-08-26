import { useEffect, useRef, useState } from 'react';
import { useJudgeGameMusic } from '../hooks/useJudgeGameMusic.ts';
import { recoverInterruptedTestGameSandbox } from '../lib/testGameSandbox.ts';

const START_EVENT = 'judge-game-music-start';
const STOP_EVENT = 'judge-game-music-stop';
const MANUAL_STATE_KEY = 'judge-game-music-manual-state-v1';
export const MUSIC_EVENING_CONTEXT_KEY = 'mafia_music_evening_id';

type MusicStartKind = 'manual' | 'night';
type MusicStartDetail = { trackId?: string; kind?: MusicStartKind };
type StoredManualState = { trackId?: string; kind: MusicStartKind };

type PoolEntry = {
  key: string;
  id: string;
  title: string;
  source_type: 'upload' | 'yandex';
  source_kind?: 'yandex_track' | 'yandex_playlist';
  audio_url: string | null;
  source_url: string | null;
  embed_url: string | null;
  excluded?: boolean;
  contributors: Array<{ player_id: string; nickname: string; kind: 'organizer' | 'player' }>;
};

const readStoredManualState = (): StoredManualState | null => {
  try {
    const raw = sessionStorage.getItem(MANUAL_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.kind !== 'manual' && parsed?.kind !== 'night') return null;
    return { kind: parsed.kind, trackId: typeof parsed.trackId === 'string' && parsed.trackId ? parsed.trackId : undefined };
  } catch { return null; }
};

const storeManualState = (detail: MusicStartDetail) => {
  try {
    sessionStorage.setItem(MANUAL_STATE_KEY, JSON.stringify({
      kind: detail.kind === 'night' ? 'night' : 'manual',
      trackId: detail.trackId || undefined,
    }));
  } catch {}
};
const clearManualState = () => { try { sessionStorage.removeItem(MANUAL_STATE_KEY); } catch {} };

export const requestJudgeGameMusicStart = (trackId?: string) => window.dispatchEvent(
  new CustomEvent<MusicStartDetail>(START_EVENT, { detail: { trackId, kind: 'manual' } }),
);
export const requestJudgeNightMusicStart = () => {
  window.dispatchEvent(new CustomEvent<MusicStartDetail>(START_EVENT, { detail: { kind: 'night' } }));
  return true;
};
export const requestJudgeGameMusicStop = () => window.dispatchEvent(new CustomEvent(STOP_EVENT));

const contributorText = (entry: PoolEntry) => {
  const organizer = entry.contributors.find((item) => item.kind === 'organizer');
  if (organizer) return 'База ведущего';
  const names = entry.contributors.map((item) => item.nickname).filter(Boolean);
  return names.length ? `От ${names.join(', ')}` : 'Игрок вечера';
};

const localPoolEntry = (track: { id: string; title: string; audio_url: string }): PoolEntry => ({
  key: `upload:${track.id}`,
  id: track.id,
  title: track.title,
  source_type: 'upload',
  audio_url: track.audio_url,
  source_url: null,
  embed_url: null,
  contributors: [{ player_id: 'organizer', nickname: 'Ведущий', kind: 'organizer' }],
});

const resolveEveningId = (): string => {
  try {
    return sessionStorage.getItem(MUSIC_EVENING_CONTEXT_KEY) || '';
  } catch {
    return '';
  }
};

export default function JudgeGameMusicController() {
  const music = useJudgeGameMusic();
  const manualRef = useRef(false);
  const manualTrackRef = useRef<string | undefined>(undefined);
  const wantedRef = useRef(false);
  const wantedTrackRef = useRef<string | undefined>(undefined);
  const [picker, setPicker] = useState<{ kind: MusicStartKind; entries: PoolEntry[]; eveningId: string } | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [active, setActive] = useState<{ entry: PoolEntry; kind: MusicStartKind } | null>(null);

  useEffect(() => {
    recoverInterruptedTestGameSandbox();
    const stored = readStoredManualState();
    if (stored?.trackId) {
      manualRef.current = true;
      manualTrackRef.current = stored.trackId;
      wantedRef.current = true;
      wantedTrackRef.current = stored.trackId;
    }
  }, []);

  const findLocalEntry = (trackId: string, entries = picker?.entries) => {
    const fromPool = entries?.find((entry) => entry.source_type === 'upload' && entry.id === trackId);
    if (fromPool) return fromPool;
    const track = music.tracks.find((item) => item.id === trackId);
    return track ? localPoolEntry(track) : null;
  };

  const startLocal = (entryOrTrackId: PoolEntry | string, kind: MusicStartKind) => {
    const entry = typeof entryOrTrackId === 'string' ? findLocalEntry(entryOrTrackId) : entryOrTrackId;
    if (!entry) return;
    setActive({ entry, kind });
    setPicker(null);
    manualRef.current = true;
    manualTrackRef.current = entry.id;
    wantedRef.current = true;
    wantedTrackRef.current = entry.id;
    storeManualState({ trackId: entry.id, kind });
    void music.start(entry.id);
  };

  const startExternal = (entry: PoolEntry, kind: MusicStartKind) => {
    music.stop();
    setPicker(null);
    setActive({ entry, kind });
    manualRef.current = true;
    manualTrackRef.current = undefined;
    wantedRef.current = false;
    wantedTrackRef.current = undefined;
    storeManualState({ kind });
  };

  const localFallbackEntries = music.tracks.map(localPoolEntry);

  const openEveningPicker = async (kind: MusicStartKind, autoStartLocal = false) => {
    setPickerLoading(true);
    setPickerError(null);
    const eveningId = resolveEveningId();
    if (!eveningId) {
      const entries = localFallbackEntries;
      if (!entries.length) setPickerError('Музыкальная база пока пуста. Добавьте трек в CRM или в слот профиля.');
      if (autoStartLocal) {
        const localEntry = entries.find((entry) => entry.source_type === 'upload');
        if (localEntry) {
          startLocal(localEntry, kind);
          setPickerLoading(false);
          return;
        }
      }
      setPicker({ kind, entries, eveningId: '' });
      setPickerLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/player/music-library/evenings/${encodeURIComponent(eveningId)}/pool`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось собрать музыку вечера.');
      const entries = (body.pool || []).filter((entry: PoolEntry) => !entry.excluded);
      if (!entries.length) setPickerError('Плейлист вечера пуст. Добавьте музыку в базу ведущего или в профили присутствующих игроков.');
      if (autoStartLocal) {
        const localEntry = entries.find((entry) => entry.source_type === 'upload');
        if (localEntry) {
          startLocal(localEntry, kind);
          return;
        }
      }
      setPicker({ kind, entries, eveningId });
    } catch (error: any) {
      setPickerError(error?.message || 'Не удалось загрузить музыку вечера.');
      setPicker({ kind, entries: [], eveningId });
    } finally {
      setPickerLoading(false);
    }
  };

  useEffect(() => {
    const start = (event: Event) => {
      const detail = (event as CustomEvent<MusicStartDetail>).detail || {};
      const kind = detail.kind === 'night' ? 'night' : 'manual';
      if (detail.trackId) {
        startLocal(detail.trackId, kind);
        return;
      }
      const eveningId = resolveEveningId();
      const localTrack = (!eveningId || eveningId === '__test_game__') ? music.tracks[0] : null;
      if (localTrack) startLocal(localTrack, kind);
      else void openEveningPicker(kind, true);
    };
    const stop = () => {
      manualRef.current = false;
      manualTrackRef.current = undefined;
      wantedRef.current = false;
      wantedTrackRef.current = undefined;
      clearManualState();
      setPicker(null);
      setActive(null);
      music.stop();
    };
    window.addEventListener(START_EVENT, start);
    window.addEventListener(STOP_EVENT, stop);
    return () => {
      window.removeEventListener(START_EVENT, start);
      window.removeEventListener(STOP_EVENT, stop);
    };
  }, [music.start, music.stop]);

  useEffect(() => {
    const sync = () => {
      if (active?.entry.source_type === 'yandex') return;
      const shouldPlay = manualRef.current && Boolean(manualTrackRef.current);
      const desiredTrack = manualTrackRef.current;
      wantedRef.current = shouldPlay;
      wantedTrackRef.current = desiredTrack;
      if (shouldPlay && music.tracks.length && !music.blocked) {
        const entry = desiredTrack ? findLocalEntry(desiredTrack) : null;
        if (entry && !active) setActive({ entry, kind: 'manual' });
        void music.start(desiredTrack);
      }
    };
    sync();
    const interval = window.setInterval(sync, 500);
    return () => window.clearInterval(interval);
  }, [active, music.blocked, music.start, music.tracks.length]);

  useEffect(() => () => music.stop(), [music.stop]);

  const exclude = async (entry: PoolEntry) => {
    if (!picker || picker.eveningId === '__test_game__') return;
    try {
      await fetch(`/api/player/music-library/evenings/${encodeURIComponent(picker.eveningId)}/exclusion`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_key: entry.key, excluded: true }),
      });
      setPicker((current) => current ? { ...current, entries: current.entries.filter((item) => item.key !== entry.key) } : current);
    } catch {}
  };

  const random = () => {
    if (!picker?.entries.length) return;
    const entry = picker.entries[Math.floor(Math.random() * picker.entries.length)];
    if (entry.source_type === 'upload') startLocal(entry, picker.kind);
    else startExternal(entry, picker.kind);
  };

  return (
    <>
      {(picker || pickerLoading) && (
        <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-[195] w-[calc(100%-1.5rem)] max-w-[390px] -translate-x-1/2 rounded-[24px] border border-violet-300/20 bg-[#111218]/98 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/45">Музыка сейчас</div>
              <div className="mt-1 text-sm font-semibold text-white">{picker?.kind === 'night' ? 'Договорка / ночь' : 'Раздача ролей'}</div>
            </div>
            <button type="button" onClick={() => setPicker(null)} className="h-9 w-9 rounded-xl border border-white/10 text-white/45">×</button>
          </div>
          {pickerLoading ? <div className="py-5 text-center text-xs text-white/35">Собираем плейлист вечера…</div> : (
            <>
              {pickerError && <div className="mt-2 rounded-xl bg-amber-300/[0.06] px-3 py-2 text-[10px] leading-4 text-amber-100/60">{pickerError}</div>}
              <button type="button" disabled={!picker?.entries.length} onClick={random} className="mt-3 min-h-11 w-full rounded-xl bg-white px-3 text-xs font-semibold text-black disabled:opacity-30">🎲 Случайный трек из вечера</button>
              <div className="mt-2 max-h-[42vh] space-y-1.5 overflow-y-auto pr-0.5">
                {picker?.entries.map((entry) => (
                  <div key={entry.key} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 p-2">
                    <button type="button" onClick={() => entry.source_type === 'upload' ? startLocal(entry, picker.kind) : startExternal(entry, picker.kind)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-xs font-semibold text-white">{entry.title}</div>
                      <div className="mt-0.5 truncate text-[9px] text-white/30">{entry.source_type === 'yandex' ? 'Яндекс · ' : 'Файл · '}{contributorText(entry)}</div>
                    </button>
                    {picker.eveningId !== '__test_game__' && <button type="button" onClick={() => void exclude(entry)} title="Не использовать сегодня" className="h-8 rounded-lg border border-white/10 px-2 text-[9px] text-white/35">убрать</button>}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => { setPicker(null); requestJudgeGameMusicStop(); }} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 text-[10px] font-semibold text-white/40">Продолжить без музыки</button>
            </>
          )}
        </div>
      )}

      {active && !picker && (
        <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-[194] w-[calc(100%-1.5rem)] max-w-[390px] -translate-x-1/2 rounded-[22px] border border-violet-300/20 bg-[#111218]/98 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/45">Сейчас играет</div>
              <div className="mt-1 truncate text-sm font-semibold text-white">{active.entry.title}</div>
              <div className="mt-0.5 truncate text-[9px] text-white/35">
                {active.entry.source_type === 'yandex' ? `Яндекс Музыка · ${contributorText(active.entry)}` : `Файл · ${contributorText(active.entry)}`}
              </div>
            </div>
            <button type="button" onClick={requestJudgeGameMusicStop} className="h-9 rounded-xl border border-white/10 px-3 text-[10px] text-white/45">Стоп</button>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => void openEveningPicker(active.kind)} className="min-h-10 flex-1 rounded-xl bg-white px-3 text-[10px] font-semibold text-black">Сменить трек</button>
            {active.entry.source_type === 'upload' && (
              <button type="button" onClick={() => void music.start(active.entry.id)} className="min-h-10 rounded-xl border border-white/10 px-3 text-[10px] text-white/55">
                {music.blocked ? 'Включить' : music.playing ? 'Играет' : 'Продолжить'}
              </button>
            )}
          </div>
          {active.entry.source_type === 'yandex' ? (
            active.entry.embed_url ? <iframe title={active.entry.title} src={active.entry.embed_url} className="mt-2 h-[80px] w-full rounded-xl border-0" allow="autoplay" /> : <a href={active.entry.source_url || '#'} target="_blank" rel="noreferrer" className="mt-2 flex min-h-11 items-center justify-center rounded-xl bg-amber-200 text-xs font-semibold text-black">Открыть в Яндекс Музыке ↗</a>
          ) : (
            <div className="mt-2 rounded-xl bg-white/[0.04] px-3 py-2 text-[10px] text-white/35">{music.blocked ? 'Браузер заблокировал автозапуск — нажмите «Включить».' : music.playing ? 'Воспроизведение продолжается.' : 'Трек остановлен.'}</div>
          )}
        </div>
      )}
    </>
  );
}
