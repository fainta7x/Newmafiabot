import { useEffect, useState } from 'react';
import { Check, Trophy, X } from 'lucide-react';

type TournamentEvent = { id: string; title: string; starts_at: string; venue?: string | null };
type Detail = {
  id: string; title: string; date: string; venue?: string | null; lifecycle: string; judge?: string | null;
  player_capacity: number; confirmed_count: number; remaining_places: number; entry_fee_rub: number;
  prize_fund_rub: number; prize_allocations: Array<{ place: string; amount_rub: number }>;
  me?: { status: string; queue_order?: number | null; payment_state?: string; organizer_note?: string | null } | null;
};

const requestJson = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
};
const dateLabel = (value: string) => new Date(value).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export default function PlayerTournamentDetail({ event, onBack, onSaved }: { event: TournamentEvent; onBack: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const load = async () => {
    setError('');
    try { setDetail(await requestJson(`/api/tournaments/evenings/${encodeURIComponent(event.id)}`)); }
    catch (e: any) { setError(e?.message || 'Не удалось загрузить турнир'); }
  };
  useEffect(() => { void load(); }, [event.id]);

  const act = async (url: string, body?: unknown) => {
    setBusy(true); setError('');
    try {
      await requestJson(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
      await load(); onSaved();
    } catch (e: any) { setError(e?.message || 'Не удалось выполнить действие'); }
    finally { setBusy(false); }
  };

  const status = detail?.me?.status;
  const registered = status === 'confirmed' || status === 'reserve';
  const paymentState = detail?.me?.payment_state || 'unpaid';

  return <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
    <div className="mx-auto max-w-[430px]">
      <button type="button" onClick={onBack} className="min-h-10 rounded-xl bg-white/[0.05] px-3 text-xs font-semibold text-white/50">← События</button>
      <section className="mt-3 rounded-[28px] border border-violet-200/10 bg-gradient-to-br from-violet-300/[0.09] to-white/[0.03] p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-100/50">Турнир</div><h1 className="mt-2 text-2xl font-semibold">{detail?.title || event.title}</h1></div><Trophy className="h-7 w-7 text-violet-100/70" /></div>
        <p className="mt-2 text-sm text-white/50">{dateLabel(detail?.date || event.starts_at)}{(detail?.venue || event.venue) ? ` · ${detail?.venue || event.venue}` : ''}</p>
        {detail?.judge ? <p className="mt-1 text-xs text-white/40">Судья: {detail.judge}</p> : null}
        {detail ? <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-black/20 p-3"><div className="text-[10px] uppercase tracking-wide text-white/35">Состав</div><div className="mt-1 text-lg font-black">{detail.confirmed_count}/{detail.player_capacity}</div><div className="text-[10px] text-white/35">свободно {detail.remaining_places}</div></div><div className="rounded-2xl bg-black/20 p-3"><div className="text-[10px] uppercase tracking-wide text-white/35">Взнос</div><div className="mt-1 text-lg font-black">{detail.entry_fee_rub} ₽</div><div className="text-[10px] text-white/35">фонд {detail.prize_fund_rub} ₽</div></div></div> : null}
      </section>

      {error ? <div className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] p-3 text-xs text-rose-100">{error}</div> : null}
      {!detail && !error ? <div className="mt-3 rounded-2xl bg-white/[0.035] p-4 text-sm text-white/45">Загрузка турнира…</div> : null}

      {detail ? <>
        <section className="mt-3 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Твоя регистрация</div>
          {!registered ? <><p className="mt-2 text-sm text-white/55">Первые 10 игроков попадают в основной состав. Следующие — в FIFO-резерв.</p><button disabled={busy || detail.lifecycle !== 'registration_open'} onClick={() => void act(`/api/tournaments/evenings/${detail.id}/register`)} className="mt-3 min-h-12 w-full rounded-xl bg-white text-sm font-semibold text-black disabled:bg-white/[0.08] disabled:text-white/30">{busy ? 'Записываем…' : 'Записаться на турнир'}</button></> : <>
            <div className="mt-2 rounded-2xl bg-black/20 p-3"><div className="flex items-center gap-2">{status === 'confirmed' ? <Check className="h-4 w-4 text-emerald-200" /> : <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-200/10 text-[10px] text-amber-100">#{detail.me?.queue_order || '?'}</span>}<strong className="text-sm">{status === 'confirmed' ? 'Ты в основном составе' : `Ты в резерве · очередь #${detail.me?.queue_order || '?'}`}</strong></div></div>
            <button disabled={busy} onClick={() => void act(`/api/tournaments/evenings/${detail.id}/cancel-registration`)} className="mt-2 min-h-11 w-full rounded-xl border border-rose-200/15 bg-rose-200/[0.05] text-xs font-semibold text-rose-100/70"><X className="mr-1 inline h-4 w-4" />Снять запись</button>
          </>}
        </section>

        {registered ? <section className="mt-3 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4">
          <div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Турнирный взнос</div><div className="mt-1 text-sm font-semibold">{detail.entry_fee_rub} ₽</div></div><span className="rounded-full bg-black/25 px-2.5 py-1 text-[11px] text-white/50">{paymentState}</span></div>
          <p className="mt-2 text-xs leading-5 text-white/40">Кнопка ниже только сообщает организатору об оплате. Оплаченным взнос считается после ручного подтверждения организатором.</p>
          {paymentState !== 'confirmed' && paymentState !== 'waived' ? <><input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Комментарий к переводу (необязательно)" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-white/25"/><button disabled={busy} onClick={() => void act(`/api/tournaments/evenings/${detail.id}/payment/report`, { note: paymentNote })} className="mt-2 min-h-11 w-full rounded-xl bg-white/[0.08] text-xs font-semibold text-white">Я оплатил(а)</button></> : <div className="mt-2 rounded-xl bg-emerald-200/[0.07] p-3 text-xs text-emerald-100/70">Оплата подтверждена организатором.</div>}
        </section> : null}

        <section className="mt-3 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Призовой фонд</div><div className="mt-2 text-xl font-black">{detail.prize_fund_rub} ₽</div><div className="mt-3 space-y-1.5">{detail.prize_allocations?.map((item) => <div key={`${item.place}-${item.amount_rub}`} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm"><span>{item.place} место</span><strong>{item.amount_rub} ₽</strong></div>)}</div></section>
      </> : null}
    </div>
  </main>;
}
