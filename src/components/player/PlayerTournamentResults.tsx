import { useEffect, useState } from 'react';
import { ChevronRight, Trophy } from 'lucide-react';

type TournamentResult = {
  id: string;
  title: string;
  date: string | null;
  venue: string | null;
  results_path: string;
  participated: boolean;
};

const formatDate = (value: string | null) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }) : null;
};

export default function PlayerTournamentResults() {
  const [items, setItems] = useState<TournamentResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/player/tournament-results', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить турниры');
        if (!cancelled) setItems(Array.isArray(body.tournaments) ? body.tournaments : []);
      })
      .catch((reason) => { if (!cancelled) setError(reason?.message || 'Не удалось загрузить турниры'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-2 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-3 px-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Турниры</div>
            <p className="mt-1 text-xs leading-5 text-white/45">Итоговые таблицы турниров с доп. баллами. Появляются после публикации организатором.</p>
          </div>
          {error ? <div className="rounded-2xl bg-white/[0.03] p-4 text-sm text-red-300">{error}</div>
            : items === null ? <div className="rounded-2xl bg-white/[0.03] p-4 text-sm text-white/45">Загружаем турниры…</div>
            : items.length === 0 ? <div className="rounded-2xl bg-white/[0.03] p-4 text-sm text-white/45">Опубликованных результатов турниров пока нет.</div>
            : <div className="space-y-2">{items.map((item) => (
              <a key={item.id} href={item.results_path} data-testid="player-tournament-result" className="flex min-h-14 items-center gap-3 rounded-2xl bg-white/[0.03] px-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><Trophy className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.title}</span>
                  <span className="block text-[11px] text-white/45">{[formatDate(item.date), item.venue].filter(Boolean).join(' · ') || 'Дата не указана'}</span>
                </span>
                {item.participated ? <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/70">ты играл</span> : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
              </a>
            ))}</div>}
        </section>
      </div>
    </main>
  );
}
