import { useEffect, useState } from 'react';
import { ChevronRight, Trophy } from 'lucide-react';
import PlayerTournamentView from './PlayerTournamentView.tsx';

type Phase = 'registration' | 'registration_closed' | 'live' | 'finished';
type TournamentItem = {
  id: string;
  title: string;
  date: string | null;
  venue: string | null;
  phase: Phase;
  capacity: number;
  confirmed_count: number;
  my_registration: string | null;
  participated: boolean;
};

const formatDate = (value: string | null) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }) : null;
};

const PHASE_BADGE: Record<Phase, string> = { registration: 'регистрация', registration_closed: 'скоро', live: 'идёт', finished: '' };
const GROUPS: Array<{ title: string; match: (phase: Phase) => boolean }> = [
  { title: 'Идёт сейчас', match: (phase) => phase === 'live' },
  { title: 'Скоро', match: (phase) => phase === 'registration' || phase === 'registration_closed' },
  { title: 'Прошедшие', match: (phase) => phase === 'finished' },
];

const mineLabel = (item: TournamentItem) => (
  item.participated ? 'вы играли' : item.my_registration === 'confirmed' ? 'вы записаны' : item.my_registration === 'reserve' ? 'вы в резерве' : ''
);

/**
 * All tournaments a player can open, played or not (owner, 2026-10-06): running ones with the live table, upcoming ones with
 * registration and finished ones. A tournament opens in `PlayerTournamentView`.
 */
export default function PlayerTournamentResults() {
  const [items, setItems] = useState<TournamentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (openId) return undefined;
    let cancelled = false;
    fetch('/api/player/tournaments', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить турниры');
        if (!cancelled) { setItems(Array.isArray(body.tournaments) ? body.tournaments : []); setError(null); }
      })
      .catch((reason) => { if (!cancelled) setError(reason?.message || 'Не удалось загрузить турниры'); });
    return () => { cancelled = true; };
  }, [openId]);

  if (openId) return <PlayerTournamentView tournamentId={openId} onBack={() => setOpenId(null)} />;

  return (
    <main className="player-workspace-page min-h-screen bg-[#090a0d] px-3 pb-28 pt-2 text-white">
      <div className="player-workspace mx-auto w-full max-w-[430px] space-y-3">
        <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-3 px-1">
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/40">Турниры</div>
            <p className="mt-1 text-[13px] leading-5 text-white/50">Состав, игры, таблица и номинации любого турнира — играете вы в нём или нет.</p>
          </div>
          {error ? <div role="alert" className="rounded-2xl bg-white/[0.03] p-4 text-sm text-red-300">{error}</div>
            : items === null ? <div role="status" className="rounded-2xl bg-white/[0.03] p-4 text-sm text-white/45">Загружаем турниры…</div>
            : items.length === 0 ? <div className="rounded-2xl bg-white/[0.03] p-4 text-sm text-white/45">Турниров пока нет.</div>
            : <div className="space-y-4">{GROUPS.map((group) => {
              const list = items.filter((item) => group.match(item.phase));
              if (!list.length) return null;
              return (
                <div key={group.title}>
                  <div className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/35">{group.title}</div>
                  <div className="space-y-2">{list.map((item) => (
                    <button key={item.id} type="button" onClick={() => setOpenId(item.id)} data-testid="player-tournament-item" className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white/[0.03] px-3 py-3 text-left">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><Trophy className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.title}</span>
                        <span className="block text-[12px] text-white/50">{[formatDate(item.date), item.venue].filter(Boolean).join(' · ') || 'Дата не указана'}</span>
                      </span>
                      {PHASE_BADGE[item.phase] ? <span className={`shrink-0 rounded-full px-2 py-1 text-[12px] font-semibold ${item.phase === 'live' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-white/70'}`}>{PHASE_BADGE[item.phase]}</span> : null}
                      {mineLabel(item) ? <span className="shrink-0 rounded-full bg-violet-400/15 px-2 py-1 text-[12px] font-semibold text-violet-100">{mineLabel(item)}</span> : null}
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                    </button>
                  ))}</div>
                </div>
              );
            })}</div>}
        </section>
      </div>
    </main>
  );
}
