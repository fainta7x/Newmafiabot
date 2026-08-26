import React, { useEffect, useRef, useState } from 'react';

type UploadTrack = {
  id: string;
  title: string;
  source_type: 'upload';
  byte_size: number;
  audio_url: string;
};

type LinkTrack = {
  id: string;
  title: string;
  source_type: 'yandex';
  source_kind: 'yandex_track' | 'yandex_playlist';
  source_url: string;
  embed_url: string | null;
};

const formatBytes = (value: number) => value ? `${(value / 1024 / 1024).toFixed(value >= 1024 * 1024 ? 1 : 2)} МБ` : '0 МБ';
const cleanFileTitle = (name: string) => name.replace(/\.[a-z0-9]{2,5}$/i, '').trim() || 'Трек';

export default function JudgeMusicPlaylist() {
  const [uploads, setUploads] = useState<UploadTrack[]>([]);
  const [links, setLinks] = useState<LinkTrack[]>([]);
  const [playerSlots, setPlayerSlots] = useState<Array<{ slot: number; entry: LinkTrack | null }>>([]);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    const response = await fetch('/api/player/music-library/organizer', { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить музыкальную базу.');
    setUploads(body.uploads || []);
    setLinks(body.links || []);
    setPlayerSlots(body.player_slots || []);
  };

  useEffect(() => {
    let cancelled = false;
    void reload()
      .catch((loadError: any) => { if (!cancelled) setError(loadError?.message || 'Не удалось загрузить музыку.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const addYandex = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/player/music-library/organizer/links', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), title: title.trim() || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось добавить ссылку.');
      setUrl('');
      setTitle('');
      await reload();
      setMessage('Ссылка добавлена в музыкальную базу.');
    } catch (addError: any) {
      setError(addError?.message || 'Не удалось добавить ссылку.');
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) throw new Error(`«${file.name}» больше 15 МБ.`);
        const response = await fetch(`/api/player/judge-music/tracks?title=${encodeURIComponent(cleanFileTitle(file.name))}`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `Не удалось загрузить ${file.name}`);
      }
      await reload();
      setMessage(files.length === 1 ? 'Файл добавлен.' : `Добавлено файлов: ${files.length}.`);
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Не удалось загрузить музыку.');
    } finally {
      setBusy(false);
    }
  };

  const removeUpload = async (track: UploadTrack) => {
    if (busy || !window.confirm(`Удалить «${track.title}»?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/player/judge-music/tracks/${encodeURIComponent(track.id)}`, { method: 'DELETE', credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось удалить трек.');
      if (preview === `upload:${track.id}`) setPreview(null);
      await reload();
    } catch (removeError: any) {
      setError(removeError?.message || 'Не удалось удалить трек.');
    } finally {
      setBusy(false);
    }
  };

  const removeLink = async (track: LinkTrack) => {
    if (busy || !window.confirm(`Удалить «${track.title}»?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/player/music-library/organizer/links/${encodeURIComponent(track.id)}`, { method: 'DELETE', credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось удалить ссылку.');
      if (preview === `yandex:${track.id}`) setPreview(null);
      await reload();
    } catch (removeError: any) {
      setError(removeError?.message || 'Не удалось удалить ссылку.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-sm text-white/40">Загрузка музыки…</section>;

  return (
    <section className="rounded-3xl border border-violet-300/10 bg-gradient-to-b from-violet-300/[0.055] to-white/[0.025] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/45">Музыкальная база</div>
      <h3 className="mt-2 text-lg font-semibold text-white">База ведущего</h3>
      <p className="mt-1 text-xs leading-5 text-white/35">Постоянная база CRM: загруженные файлы и ссылки Яндекс Музыки. Личные слоты игрока показаны отдельно и тоже доступны в плейлисте вечера.</p>

      <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/20 p-3">
        <div className="text-xs font-semibold text-white/65">Добавить из Яндекс Музыки</div>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название (необязательно)" className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0d11] px-3 text-xs text-white outline-none placeholder:text-white/20" />
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Ссылка на трек или плейлист" inputMode="url" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0c0d11] px-3 text-xs text-white outline-none placeholder:text-white/20" />
        <button type="button" disabled={busy || !url.trim()} onClick={() => void addYandex()} className="mt-2 min-h-11 w-full rounded-xl bg-violet-100 px-3 text-xs font-semibold text-[#15121b] disabled:opacity-35">＋ Добавить ссылку</button>
      </div>

      <input ref={fileRef} type="file" multiple accept="audio/*,.mp3,.m4a,.ogg,.wav,.webm" className="hidden" onChange={uploadFiles} />
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-xs font-semibold text-white disabled:opacity-35">＋ Загрузить аудиофайл</button>
      <p className="mt-2 text-[10px] leading-4 text-white/25">Файл до 15 МБ. Для Яндекса приложение хранит только ссылку — музыка не скачивается на сервер.</p>

      {error && <div className="mt-3 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-xs text-rose-100/75">{error}</div>}
      {message && <div className="mt-3 rounded-2xl bg-emerald-400/[0.08] px-3 py-3 text-xs text-emerald-100/75">{message}</div>}

      {playerSlots.some((item) => item.entry) && (
        <div className="mt-4 rounded-2xl border border-sky-200/[0.08] bg-sky-300/[0.04] p-3">
          <div className="text-xs font-semibold text-sky-100/75">Мои слоты игрока</div>
          <p className="mt-1 text-[10px] leading-4 text-white/30">Ссылки из профиля не теряются: они входят в пул ведущего для тестовой игры и вечера, где вы ведёте.</p>
          <div className="mt-2 space-y-1.5">
            {playerSlots.map((item) => item.entry ? (
              <div key={item.slot} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-300/[0.08] text-[10px] text-sky-100/75">{item.slot}</span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">{item.entry.title}</div>
                  <div className="text-[9px] text-white/30">Яндекс · слот игрока</div>
                </div>
              </div>
            ) : null)}
          </div>
        </div>
      )}
      <div className="mt-4 space-y-2">
        {uploads.map((track) => (
          <div key={`upload:${track.id}`} className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPreview((current) => current === `upload:${track.id}` ? null : `upload:${track.id}`)} className="h-10 w-10 shrink-0 rounded-xl bg-white/[0.08] text-xs text-white">{preview === `upload:${track.id}` ? '■' : '▶'}</button>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{track.title}</div><div className="mt-0.5 text-[10px] text-white/30">Файл · {formatBytes(track.byte_size)}</div></div>
              <button type="button" onClick={() => void removeUpload(track)} className="h-9 w-9 rounded-xl border border-rose-300/10 bg-rose-400/[0.04] text-rose-200/55">×</button>
            </div>
            {preview === `upload:${track.id}` && <audio className="mt-3 w-full" src={track.audio_url} controls autoPlay preload="metadata" />}
          </div>
        ))}

        {links.map((track) => (
          <div key={`yandex:${track.id}`} className="rounded-2xl border border-amber-200/[0.08] bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPreview((current) => current === `yandex:${track.id}` ? null : `yandex:${track.id}`)} className="h-10 w-10 shrink-0 rounded-xl bg-amber-200/[0.08] text-xs text-amber-100">Я</button>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{track.title}</div><div className="mt-0.5 text-[10px] text-white/30">Яндекс · {track.source_kind === 'yandex_playlist' ? 'плейлист' : 'трек'}</div></div>
              <a href={track.source_url} target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-xs text-white/55">↗</a>
              <button type="button" onClick={() => void removeLink(track)} className="h-9 w-9 rounded-xl border border-rose-300/10 bg-rose-400/[0.04] text-rose-200/55">×</button>
            </div>
            {preview === `yandex:${track.id}` && track.embed_url && <iframe title={track.title} src={track.embed_url} className="mt-3 h-[80px] w-full rounded-xl border-0" allow="autoplay" />}
            {preview === `yandex:${track.id}` && !track.embed_url && <div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 text-[10px] text-white/35">Для этой ссылки доступно открытие в Яндекс Музыке.</div>}
          </div>
        ))}

        {!uploads.length && !links.length && !playerSlots.some((item) => item.entry) && (
          <div data-testid="music-library-empty" className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/30">
            Музыкальная база пока пустая.
          </div>
        )}
      </div>
    </section>
  );
}
