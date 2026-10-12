import { useEffect, useState } from 'react';
import { countPlayers } from '../../lib/russianPlural.ts';
import PokerTournamentSchedule, { type PokerScheduleRow } from './PokerTournamentSchedule.tsx';
import PokerTournamentParticipants, { type PokerTournamentParticipant } from './PokerTournamentParticipants.tsx';
import { getJson } from '../../lib/requestJson.ts';

type Tournament = {
  id: string; title: string; description: string; status: 'registration' | 'running' | 'finished' | 'cancelled'; cancel_reason: string | null;
  start_at: string; players: number; spots_left: number | null; alive: number | null; my_table_id: string | null;
  prizes?: { mode: 'pool' | 'fixed'; guarantee: number; rebuyTokens: number; total: number; payouts: number[]; sharesPct: number[] };
  settings: { minPlayers: number; maxPlayers: number | null; startingStack: number; levelMinutes: number; seatsPerTable: number; rebuyUntilLevel: number; rebuyCostTokens: number; rebuyChips: number; prizeTokens: number[]; lateRegUntilLevel?: number };
  late_reg_open?: boolean; schedule?: PokerScheduleRow[]; clock?: { level: number } | null; participants?: PokerTournamentParticipant[];
  my_entry: { status: string; place: number | null; busted?: boolean } | null;
  standings: Array<{ nickname: string; place: number }>;
};

const date = (value: string) => new Date(value).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const num = (value: number) => value.toLocaleString('ru-RU');

/** A poker tournament opened from the calendar: what it is, who is in, free registration. */
export default function PlayerPokerTournamentDetail({ tournamentId, onBack, onSaved, onOpenPoker }: {
  tournamentId: string; onBack: () => void; onSaved: () => void; onOpenPoker?: (tableId?: string | null) => void;
}) {
  const [item, setItem] = useState<Tournament | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const body = await getJson<any>(`/api/player/poker/tournaments/${encodeURIComponent(tournamentId)}`, 'Не удалось открыть турнир');
    setItem(body.tournament);
  };
  useEffect(() => { window.scrollTo(0, 0); void load().catch((reason) => setError(reason.message)); }, [tournamentId]);

  const registered = Boolean(item?.my_entry && item.my_entry.status !== 'cancelled');
  const act = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/player/poker/tournaments/${encodeURIComponent(item.id)}/register`, { method: registered ? 'DELETE' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: registered ? undefined : '{}' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Не удалось сохранить запись');
      await load(); onSaved();
    } catch (reason: any) { setError(reason.message || 'Не удалось сохранить запись'); } finally { setBusy(false); }
  };

  const s = item?.settings;
  const payouts = item?.prizes?.payouts ?? s?.prizeTokens ?? [];
  const places = payouts.some((amount) => amount > 0) ? payouts.map((amount, index) => `${index + 1} место — ${num(amount)} жетонов`).join(' · ') : 'без жетонов, только кубок и ачивки победителю';
  const pool = item?.prizes?.mode === 'pool' && item.prizes.total > 0 ? item.prizes : null;
  const prizes = pool ? `фонд ${num(pool.total)} (гарантия клуба ${num(pool.guarantee)}${pool.rebuyTokens > 0 ? ` + докупки ${num(pool.rebuyTokens)}` : ' + все докупки'}): ${places}` : places;

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white"><div className="mx-auto max-w-[430px]">
      <button type="button" onClick={onBack} className="min-h-10 rounded-xl bg-white/[0.05] px-3 text-xs font-semibold text-white/50">← События</button>
      {item && s ? <>
        <header className="mt-3 px-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-200/70">Покерный турнир</div>
          <h1 className="mt-1 text-2xl font-semibold">{item.title}</h1>
          <p className="mt-1 text-sm text-white/50">{date(item.start_at)}</p>
        </header>
        {item.description ? <section className="mt-3 whitespace-pre-wrap rounded-[20px] border border-white/[0.07] bg-white/[0.035] p-3.5 text-sm leading-6 text-white/75">{item.description}</section> : null}
        <section className="mt-3 space-y-2 rounded-[20px] border border-white/[0.07] bg-white/[0.035] p-3.5 text-sm">
          <div className="flex justify-between gap-3"><span className="text-white/45">Записались</span><b>{countPlayers(item.players)}{s.maxPlayers ? ` из ${s.maxPlayers}` : ''}</b></div>
          {item.status === 'registration' ? <div className="flex justify-between gap-3"><span className="text-white/45">Чтобы начать</span><b className="text-right">не меньше {s.minPlayers}</b></div> : null}
          <div className="flex justify-between gap-3"><span className="text-white/45">Вход</span><b>бесплатно, стек {num(s.startingStack)} фишек</b></div>
          <div className="flex justify-between gap-3"><span className="text-white/45">Уровень блайндов</span><b>{s.levelMinutes} мин</b></div>
          <div className="flex justify-between gap-3"><span className="text-white/45">Мест за столом</span><b>до {s.seatsPerTable}</b></div>
          <div className="flex justify-between gap-3"><span className="text-white/45">Докупка</span><b className="text-right">{s.rebuyUntilLevel > 0 ? `до уровня ${s.rebuyUntilLevel}, ${num(s.rebuyCostTokens)} жетонов за ${num(s.rebuyChips)} фишек` : 'нет'}</b></div>
          <div className="flex justify-between gap-3"><span className="text-white/45">Поздняя запись</span><b className="text-right">{(s.lateRegUntilLevel ?? 0) > 0 ? `в идущий турнир, до конца ${s.lateRegUntilLevel}-го уровня` : 'нет'}</b></div>
          <div className="flex justify-between gap-3"><span className="text-white/45">Призы</span><b className="text-right">{prizes}</b></div>
        </section>
        <section className="mt-3 rounded-[20px] border border-white/[0.07] bg-white/[0.035] p-3.5" data-testid="poker-tournament-participants-card">
          <h2 className="mb-2 text-sm font-semibold">{item.status === 'running' || item.status === 'finished' ? 'Участники' : 'Кто записался'} · {item.participants?.length ?? item.players}</h2>
          <PokerTournamentParticipants participants={item.participants || []} />
          {item.status === 'registration' && s.minPlayers > item.players ? <p className="mt-2 text-xs text-white/45">Чтобы турнир начался, нужно ещё {s.minPlayers - item.players}</p> : null}
        </section>
        {item.schedule?.length ? <section className="mt-3 rounded-[20px] border border-white/[0.07] bg-white/[0.035] p-3.5">
          <h2 className="mb-2 text-sm font-semibold">Уровни и время</h2>
          <PokerTournamentSchedule rows={item.schedule} current={item.clock?.level ?? null} started={item.status === 'running'} />
        </section> : null}
        {item.status === 'cancelled' ? <p className="mt-3 rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white/60">Турнир отменён{item.cancel_reason ? `: ${item.cancel_reason}` : ''}</p> : null}
        {error ? <p className="mt-3 rounded-xl bg-rose-300/[0.08] px-3 py-2 text-sm text-rose-100">{error}</p> : null}
        {item.status === 'registration' ? <>
          <button type="button" disabled={busy || (!registered && item.spots_left === 0)} onClick={() => void act()} className={`mt-3 min-h-12 w-full rounded-2xl text-sm font-black ${registered ? 'border border-white/10 bg-white/[0.05] text-white/70' : 'bg-white text-black'} disabled:opacity-50`}>
            {registered ? 'Отписаться' : item.spots_left === 0 ? 'Мест нет' : 'Записаться бесплатно'}
          </button>
          {registered ? <p className="mt-2 text-center text-xs text-emerald-200/70">Запись есть. Турнир начнётся сам в назначенное время, если наберётся минимум</p> : null}
        </> : null}
        {item.status === 'running' ? <div className="mt-3 space-y-2">
          <p className="text-sm text-white/65">Идёт игра, в турнире {item.alive ?? item.players}.{item.my_entry?.place ? ` Я выбыл: ${item.my_entry.place} место.` : ''}</p>
          {item.late_reg_open && !registered ? <button type="button" data-testid="poker-tournament-late-reg" disabled={busy} onClick={() => void act()} className="min-h-12 w-full rounded-2xl bg-white text-sm font-black text-black disabled:opacity-50">Войти в турнир бесплатно (запись до конца {s.lateRegUntilLevel}-го уровня)</button> : null}
          {onOpenPoker && (item.my_table_id || registered) ? <button type="button" onClick={() => onOpenPoker(item.my_table_id)} className="min-h-12 w-full rounded-2xl bg-white text-sm font-black text-black">Открыть покер</button> : null}
        </div> : null}
        {item.status === 'finished' && item.standings.length ? <ol className="mt-3 space-y-1 rounded-[20px] border border-white/[0.07] bg-white/[0.035] p-3.5 text-sm">{item.standings.slice(0, 10).map((entry) => <li key={entry.place}><b className="text-amber-100">{entry.place}.</b> {entry.nickname}</li>)}</ol> : null}
      </> : !error ? <p className="mt-4 text-sm text-white/45">Загружаем турнир…</p> : null}
      {!item && error ? <p className="mt-4 rounded-xl bg-rose-300/[0.08] px-3 py-2 text-sm text-rose-100">{error}</p> : null}
    </div></main>
  );
}
