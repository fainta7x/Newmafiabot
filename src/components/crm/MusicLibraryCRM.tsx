import { useEffect, useMemo, useState } from 'react';
import type { GameEvening } from '../../lib/api.ts';
import JudgeMusicPlaylist from '../player/JudgeMusicPlaylist.tsx';

type PoolEntry = {
  key: string;
  id: string;
  title: string;
  source_type: 'upload' | 'yandex';
  source_kind?: 'yandex_track' | 'yandex_playlist';
  source_url: string | null;
  embed_url: string | null;
  excluded?: boolean;
  contributors: Array<{ nickname: string; kind: 'organizer' | 'player' }>;
};

const formatWhen = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

const contributorText = (entry: PoolEntry) => {
  if (entry.contributors.some((item) => item.kind === 'organizer')) return 'Ведущий';
  const names = entry.contributors.map((item) => item.nickname).filter(Boolean);
  return names.length ? names.join(', ') : 'Игроки вечера';
};

export function MusicLibraryCRM({ evenings }: { evenings: GameEvening[] }) {
  const initialEvening = useMemo(
    () => evenings.find((item) => item.status === 'active') || evenings.find((item) => item.status === 'published') || evenings[0] || null,
    [evenings],
  );
  const [selectedEveningId, setSelectedEveningId] = useState(initialEvening?.id || '');
  const [pool, setPool] = useState<PoolEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedEveningId || evenings.some((item) => item.id === selectedEveningId)) return;
    setSelectedEveningId(initialEvening?.id || '');
  }, [evenings, initialEvening, selectedEveningId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedEveningId) {
      setPool([]);
      setError(null);
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError(null);
    void fetch(`/api/player/music-library/evenings/${encodeURIComponent(selectedEveningId)}/pool`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось собрать плейлист вечера.');
        if (!cancelled) setPool(Array.isArray(body.pool) ? body.pool.filter((entry: PoolEntry) => !entry.excluded) : []);
      })
      .catch((loadError: any) => { if (!cancelled) { setPool([]); setError(loadError?.message || 'Не удалось собрать плейлист вечера.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedEveningId]);

  const selectedEvening = evenings.find((item) => item.id === selectedEveningId) || null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <section className="rounded-3xl border border-violet-300/15 bg-gradient-to-b from-violet-300/[0.07] to-white/[0.025] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/45">CRM · Музыка</div>
        <h2 className="mt-2 text-xl font-semibold text-white">Музыкальная база</h2>
        <p className="mt-1 text-xs leading-5 text-white/40">Здесь живёт постоянная база ведущего. Ниже можно отдельно посмотреть, какой пул соберётся для выбранного вечера.</p>
      </section>

      <JudgeMusicPlaylist />

      <section className="rounded-3xl border border-sky-300/15 bg-gradient-to-b from-sky-300/[0.06] to-white/[0.025] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100/45">Состав на игру</div>
            <h3 className="mt-2 text-lg font-semibold text-white">Плейлист выбранного вечера</h3>
            <p className="mt-1 text-xs leading-5 text-white/35">В базу вечера попадают музыка ведущего и два слота только тех игроков, которых отметили как пришедших.</p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-300/[0.08] text-sm text-sky-100/75">♫</span>
        </div>

        <select value={selectedEveningId} onChange={(event) => setSelectedEveningId(event.target.value)} className="mt-4 min-h-11 w-full rounded-xl border border-white/10 bg-[#0c0d11] px-3 text-xs text-white outline-none">
          <option value="">Выберите вечер</option>
          {evenings.map((evening) => <option key={evening.id} value={evening.id}>{evening.title} · {formatWhen(evening.starts_at)}</option>)}
        </select>

        {loading ? <div className="py-6 text-center text-xs text-white/35">Собираем плейлист…</div> : null}
        {error ? <div className="mt-3 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-xs text-rose-100/75">{error}</div> : null}
        {!loading && !error && !selectedEvening ? <div className="mt-3 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/30">Создайте или опубликуйте вечер, чтобы посмотреть его музыкальный пул.</div> : null}
        {!loading && !error && selectedEvening && !pool.length ? <div className="mt-3 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/30">Плейлист пуст. Добавьте музыку ведущего или отметьте пришедших игроков.</div> : null}

        {pool.length ? (
          <div className="mt-3 space-y-2">
            {pool.map((entry) => (
              <div key={entry.key} className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
                <div className="flex items-start gap-2">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-xs text-white/60">{entry.source_type === 'yandex' ? 'Я' : '♫'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{entry.title}</div>
                    <div className="mt-0.5 text-[10px] text-white/30">{entry.source_type === 'yandex' ? 'Яндекс' : 'Файл'} · {contributorText(entry)}</div>
                  </div>
                  {entry.source_url ? <a href={entry.source_url} target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-xs text-white/55">↗</a> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default MusicLibraryCRM;
