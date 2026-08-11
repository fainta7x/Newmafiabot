import React, { useEffect, useState } from 'react';

type PaymentItem = {
  participant_id: string;
  evening_id: string;
  title: string;
  starts_at: string | null;
  venue: string | null;
  evening_status: string;
  attendance_status: string;
  amount_due: number;
  amount_paid: number;
  outstanding: number;
  payment_status: 'unpaid' | 'partial' | 'paid' | 'waived' | string;
  updated_at: string | null;
};

type PaymentData = {
  summary: { amount_due: number; amount_paid: number; outstanding: number; open: number; closed: number };
  current: PaymentItem[];
  history: PaymentItem[];
  free_evening_credits: number;
  online_payment_available: boolean;
};

const rubles = (value: number) => `${Math.max(0, Math.trunc(Number(value || 0))).toLocaleString('ru-RU')} ₽`;
const dateLabel = (value: string | null) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};
const statusLabel = (status: string) => {
  if (status === 'paid') return 'Оплачено';
  if (status === 'waived') return 'Бесплатно';
  if (status === 'partial') return 'Частично';
  return 'К оплате';
};
const statusClass = (status: string) => {
  if (status === 'paid' || status === 'waived') return 'bg-emerald-400/[0.08] text-emerald-200/80';
  if (status === 'partial') return 'bg-amber-400/[0.08] text-amber-200/80';
  return 'bg-rose-400/[0.08] text-rose-200/80';
};

function PaymentCard({ item, freeCredits, applying, onUseFree }: { item: PaymentItem; freeCredits: number; applying: boolean; onUseFree: (id: string) => void }) {
  const canUseFree = freeCredits > 0 && item.outstanding > 0 && item.amount_paid === 0 && item.payment_status !== 'waived';
  return (
    <article className="rounded-2xl bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-white">{item.title}</div>
          <div className="mt-1 text-xs text-white/40">{dateLabel(item.starts_at)}</div>
          {item.venue && <div className="mt-1 truncate text-xs text-white/30">📍 {item.venue}</div>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${statusClass(item.payment_status)}`}>{statusLabel(item.payment_status)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/[0.04] p-2"><div className="text-sm font-semibold text-white/80">{rubles(item.amount_due)}</div><div className="mt-1 text-[10px] text-white/30">стоимость</div></div>
        <div className="rounded-xl bg-white/[0.04] p-2"><div className="text-sm font-semibold text-emerald-200/75">{rubles(item.amount_paid)}</div><div className="mt-1 text-[10px] text-white/30">оплачено</div></div>
        <div className="rounded-xl bg-white/[0.04] p-2"><div className={`text-sm font-semibold ${item.outstanding > 0 ? 'text-rose-200/80' : 'text-white/65'}`}>{rubles(item.outstanding)}</div><div className="mt-1 text-[10px] text-white/30">осталось</div></div>
      </div>
      {canUseFree && (
        <button type="button" disabled={applying} onClick={() => onUseFree(item.participant_id)} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-medium text-white/70 disabled:opacity-40">
          {applying ? 'Применяем…' : '🎟️ Использовать бесплатный вечер'}
        </button>
      )}
    </article>
  );
}

export default function PlayerPayments({ onBack }: { onBack?: () => void }) {
  const [data, setData] = useState<PaymentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await fetch('/api/player/payments', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить оплату');
      setData(body as PaymentData);
      setError(null);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить оплату');
    }
  };

  useEffect(() => { void load(); }, []);

  const useFreeEvening = async (participantId: string) => {
    if (applyingId) return;
    setApplyingId(participantId);
    setError(null);
    try {
      const response = await fetch(`/api/player/payments/${encodeURIComponent(participantId)}/use-free-evening`, { method: 'POST', credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось применить бесплатный вечер');
      await load();
    } catch (applyError: any) {
      setError(applyError?.message || 'Не удалось применить бесплатный вечер');
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-col gap-3">
      {onBack && <button type="button" onClick={onBack} className="self-start rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white/60">← На главную</button>}
      <div className="px-1 pb-1 pt-2"><div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div><h1 className="mt-1 text-2xl font-semibold text-white">Оплата</h1><p className="mt-1 text-sm text-white/45">Игровые вечера, задолженность и история</p></div>

      {error && <p className="rounded-2xl border border-rose-400/10 bg-rose-400/[0.06] px-3 py-3 text-sm text-rose-100/70">{error}</p>}
      {!data ? <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-sm text-white/45">Загрузка оплаты…</div> : (
        <>
          <section className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.035] p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/35">К оплате</div>
            <div className="mt-2 text-3xl font-semibold text-white">{rubles(data.summary.outstanding)}</div>
            <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-black/20 p-3"><div className="text-lg font-semibold text-white/80">{rubles(data.summary.amount_paid)}</div><div className="mt-1 text-[11px] text-white/35">оплачено всего</div></div><div className="rounded-2xl bg-black/20 p-3"><div className="text-lg font-semibold text-white/80">{data.free_evening_credits}</div><div className="mt-1 text-[11px] text-white/35">бесплатных вечеров</div></div></div>
          </section>

          {!data.online_payment_available && <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-xs leading-5 text-white/40">Онлайн-оплата пока не подключена. Здесь уже отображается фактический статус, который ведёт организатор; эквайринг/СБП подключим отдельным этапом.</div>}

          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Текущие платежи</h2>{data.current.length ? <div className="space-y-2">{data.current.map((item) => <PaymentCard key={item.participant_id} item={item} freeCredits={data.free_evening_credits} applying={applyingId === item.participant_id} onUseFree={useFreeEvening} />)}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Сейчас задолженности и активных платежей нет.</p>}</section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">История</h2>{data.history.length ? <div className="space-y-2">{data.history.map((item) => <PaymentCard key={item.participant_id} item={item} freeCredits={0} applying={false} onUseFree={() => {}} />)}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">История оплат пока пустая.</p>}</section>
        </>
      )}
    </div>
  );
}
