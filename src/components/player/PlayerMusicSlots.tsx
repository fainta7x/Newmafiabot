import { useEffect, useState } from 'react';

type MusicEntry = {
  id: string;
  title: string;
  source_url: string;
  embed_url: string | null;
  source_kind: 'yandex_track' | 'yandex_playlist';
};

type Slot = { slot: 1 | 2; entry: MusicEntry | null };

export default function PlayerMusicSlots() {
  const [slots, setSlots] = useState<Slot[]>([
    { slot: 1, entry: null },
    { slot: 2, entry: null },
  ]);
  const [drafts, setDrafts] = useState<Record<number, { title: string; url: string }>>({
    1: { title: '', url: '' },
    2: { title: '', url: '' },
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch('/api/player/music-library/player-slots', { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить музыку.');
    const next = body.slots as Slot[];
    setSlots(next);
    setDrafts(Object.fromEntries(next.map(({ slot, entry }) => [slot, {
      title: entry?.title || '',
      url: entry?.source_url || '',
    }])));
  };

  useEffect(() => {
    void load().catch((loadError: any) => setError(loadError?.message || 'Не удалось загрузить музыку.'));
  }, []);

  const save = async (slot: 1 | 2) => {
    const draft = drafts[slot];
    if (!draft?.url.trim() || busy) return;
    setBusy(slot);
    setError(null);
    try {
      const response = await fetch(`/api/player/music-library/player-slots/${slot}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: draft.url.trim(), title: draft.title.trim() || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить ссылку.');
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить ссылку.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (slot: 1 | 2) => {
    if (busy) return;
    setBusy(slot);
    setError(null);
    try {
      const response = await fetch(`/api/player/music-library/player-slots/${slot}`, { method: 'DELETE', credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось удалить музыку.');
      await load();
    } catch (removeError: any) {
      setError(removeError?.message || 'Не удалось удалить музыку.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-3xl border border-violet-300/10 bg-gradient-to-b from-violet-300/[0.055] to-white/[0.025] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/45">Моя музыка</div>
      <h3 className="mt-2 text-lg font-semibold text-white">2 трека для вечера</h3>
      <p className="mt-1 text-xs leading-5 text-white/35">
        Добавьте трек или плейлист Яндекс Музыки. Он попадёт в общий плейлист только когда вы отмечены на месте.
      </p>

      {error && <div className="mt-3 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-xs text-rose-100/75">{error}</div>}

      <div className="mt-4 space-y-3">
        {slots.map(({ slot, entry }) => {
          const draft = drafts[slot] || { title: '', url: '' };
          return (
            <div key={slot} className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-white">Слот {slot}</strong>
                {entry && (
                  <a href={entry.source_url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-violet-200/70">
                    Открыть ↗
                  </a>
                )}
              </div>
              <input
                value={draft.title}
                onChange={(event) => setDrafts((current) => ({ ...current, [slot]: { ...draft, title: event.target.value } }))}
                placeholder="Название, например: Ночная тема"
                className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0d11] px-3 text-xs text-white outline-none placeholder:text-white/20"
              />
              <input
                value={draft.url}
                onChange={(event) => setDrafts((current) => ({ ...current, [slot]: { ...draft, url: event.target.value } }))}
                placeholder="Ссылка Яндекс Музыки"
                inputMode="url"
                className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0c0d11] px-3 text-xs text-white outline-none placeholder:text-white/20"
              />
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  disabled={busy !== null || !draft.url.trim()}
                  onClick={() => void save(slot)}
                  className="min-h-10 rounded-xl bg-white px-3 text-xs font-semibold text-black disabled:opacity-35"
                >
                  {busy === slot ? 'Сохраняем…' : entry ? 'Обновить' : 'Добавить'}
                </button>
                {entry && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void remove(slot)}
                    className="min-h-10 rounded-xl border border-rose-300/10 bg-rose-400/[0.04] px-3 text-xs text-rose-200/60 disabled:opacity-35"
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
