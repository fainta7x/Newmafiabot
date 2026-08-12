import React, { useEffect, useRef, useState } from 'react';
import { loadJudgeMusicPlaylist, type JudgeMusicTrack } from '../../hooks/useJudgeGameMusic.ts';

const formatBytes = (value: number) => {
  if (!value) return '0 МБ';
  return `${(value / 1024 / 1024).toFixed(value >= 1024 * 1024 ? 1 : 2)} МБ`;
};

const cleanFileTitle = (name: string) => name.replace(/\.[a-z0-9]{2,5}$/i, '').trim() || 'Трек';

export default function JudgeMusicPlaylist() {
  const [tracks, setTracks] = useState<JudgeMusicTrack[]>([]);
  const [limit, setLimit] = useState(10);
  const [maxBytes, setMaxBytes] = useState(15 * 1024 * 1024);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    const payload = await loadJudgeMusicPlaylist();
    if (!payload) return;
    setTracks(payload.tracks);
    setLimit(payload.limit);
    setMaxBytes(payload.max_track_bytes);
  };

  useEffect(() => {
    let cancelled = false;
    void loadJudgeMusicPlaylist()
      .then((payload) => {
        if (cancelled || !payload) return;
        setTracks(payload.tracks);
        setLimit(payload.limit);
        setMaxBytes(payload.max_track_bytes);
      })
      .catch((loadError: any) => { if (!cancelled) setError(loadError?.message || 'Не удалось загрузить плейлист'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || uploading) return;
    const freeSlots = Math.max(0, limit - tracks.length);
    if (!freeSlots) {
      setError(`В плейлисте уже максимальные ${limit} треков.`);
      return;
    }
    const selected = files.slice(0, freeSlots);
    const tooLarge = selected.find((file) => file.size > maxBytes);
    if (tooLarge) {
      setError(`«${tooLarge.name}» больше ${formatBytes(maxBytes)}. Сожмите файл или выберите другой.`);
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      for (const file of selected) {
        const response = await fetch(`/api/player/judge-music/tracks?title=${encodeURIComponent(cleanFileTitle(file.name))}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `Не удалось загрузить ${file.name}`);
      }
      await reload();
      setMessage(selected.length === 1 ? 'Трек добавлен в личный плейлист.' : `Добавлено треков: ${selected.length}.`);
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Не удалось загрузить музыку');
      await reload().catch(() => undefined);
    } finally {
      setUploading(false);
    }
  };

  const saveOrder = async (next: JudgeMusicTrack[]) => {
    const previous = tracks;
    setTracks(next);
    setError(null);
    try {
      const response = await fetch('/api/player/judge-music/order', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_ids: next.map((track) => track.id) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось изменить порядок');
    } catch (orderError: any) {
      setTracks(previous);
      setError(orderError?.message || 'Не удалось изменить порядок');
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[target]] = [next[target], next[index]];
    void saveOrder(next);
  };

  const remove = async (track: JudgeMusicTrack) => {
    if (!window.confirm(`Удалить «${track.title}» из плейлиста?`)) return;
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/player/judge-music/tracks/${encodeURIComponent(track.id)}`, {
        method: 'DELETE', credentials: 'include',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось удалить трек');
      if (previewId === track.id) setPreviewId(null);
      await reload();
      setMessage('Трек удалён.');
    } catch (removeError: any) {
      setError(removeError?.message || 'Не удалось удалить трек');
    }
  };

  if (loading) {
    return <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-sm text-white/40">Загрузка музыки…</section>;
  }

  return (
    <section className="rounded-3xl border border-violet-300/10 bg-gradient-to-b from-violet-300/[0.055] to-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/45">Музыка игры</div>
          <h3 className="mt-2 text-lg font-semibold text-white">Мой плейлист</h3>
          <p className="mt-1 text-xs leading-5 text-white/35">Личный набор ведущего. Музыка используется при раздаче ролей, нулевой ночи и обычных ночах.</p>
        </div>
        <div className="shrink-0 rounded-2xl bg-black/20 px-3 py-2 text-center">
          <div className="text-lg font-black text-white">{tracks.length}/{limit}</div>
          <div className="text-[9px] uppercase tracking-wide text-white/30">треков</div>
        </div>
      </div>

      <input ref={fileRef} type="file" multiple accept="audio/*,.mp3,.m4a,.ogg,.wav,.webm" className="hidden" onChange={uploadFiles} />
      <button
        type="button"
        disabled={uploading || tracks.length >= limit}
        onClick={() => fileRef.current?.click()}
        className="mt-4 min-h-11 w-full rounded-2xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-35"
      >
        {uploading ? 'Загружаем…' : tracks.length >= limit ? 'Плейлист заполнен' : '＋ Добавить музыку'}
      </button>
      <p className="mt-2 text-[10px] leading-4 text-white/25">До {limit} треков · один файл до {formatBytes(maxBytes)} · MP3/M4A/OGG/WAV/WebM.</p>

      {error && <div className="mt-3 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-xs text-rose-100/75">{error}</div>}
      {message && <div className="mt-3 rounded-2xl bg-emerald-400/[0.08] px-3 py-3 text-xs text-emerald-100/75">{message}</div>}

      {tracks.length ? (
        <div className="mt-4 space-y-2">
          {tracks.map((track, index) => (
            <div key={track.id} className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewId((current) => current === track.id ? null : track.id)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-sm text-white"
                  title="Прослушать"
                >
                  {previewId === track.id ? '■' : '▶'}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{index + 1}. {track.title}</div>
                  <div className="mt-0.5 text-[10px] text-white/30">{formatBytes(track.byte_size)}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="h-9 w-9 rounded-xl border border-white/10 bg-white/[0.04] text-xs text-white/45 disabled:opacity-20">↑</button>
                  <button type="button" disabled={index === tracks.length - 1} onClick={() => move(index, 1)} className="h-9 w-9 rounded-xl border border-white/10 bg-white/[0.04] text-xs text-white/45 disabled:opacity-20">↓</button>
                  <button type="button" onClick={() => void remove(track)} className="h-9 w-9 rounded-xl border border-rose-300/10 bg-rose-400/[0.04] text-xs text-rose-200/55">×</button>
                </div>
              </div>
              {previewId === track.id && <audio className="mt-3 w-full" src={track.audio_url} controls autoPlay preload="metadata" />}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-center text-xs leading-5 text-white/30">
          Пока пусто. Добавьте музыку, которую хотите использовать за игровым столом.
        </div>
      )}
    </section>
  );
}
