import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDollarSign, RefreshCw, XCircle } from 'lucide-react';

type PaymentParticipant = {
  id: string;
  player_id: string;
  nickname: string;
  payment_status: string;
  amount_due: number;
  amount_paid: number;
  club_role?: string | null;
  judge_level?: string | null;
};

type PaymentPayload = {
  evening: {
    id: string;
    title: string;
    status: string;
    settled_at?: string | null;
    closed: boolean;
  };
  participants: PaymentParticipant[];
};

const money = (value: number) => `${Math.max(0, Math.round(Number(value || 0))).toLocaleString('ru-RU')} ₽`;

export default function EveningPaymentsPanel({ eveningId }: { eveningId: string }) {
  const [data, setData] = useState<PaymentPayload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/payments`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить оплаты');
      setData(body as PaymentPayload);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить оплаты');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
  }, [eveningId]);

  const setPaid = async (participant: PaymentParticipant, paid: boolean) => {
    if (busyId) return;
    setBusyId(participant.id);
    setError(null);
    const previous = data;
    setData((current) => current ? {
      ...current,
      participants: current.participants.map((item) => item.id === participant.id ? {
        ...item,
        amount_paid: paid ? Number(item.amount_due || 0) : 0,
        payment_status: paid ? 'paid' : 'unpaid',
      } : item),
    } : current);

    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/payments/${encodeURIComponent(participant.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось изменить оплату');
      setData(body as PaymentPayload);
    } catch (saveError: any) {
      setData(previous);
      setError(saveError?.message || 'Не удалось изменить оплату');
    } finally {
      setBusyId(null);
    }
  };

  const summary = useMemo(() => {
    const participants = data?.participants || [];
    const payable = participants.filter((item) => Number(item.amount_due || 0) > 0 && item.payment_status !== 'waived');
    const paid = payable.filter((item) => item.payment_status === 'paid' || Number(item.amount_paid || 0) >= Number(item.amount_due || 0));
    return { total: payable.length, paid: paid.length, unpaid: Math.max(0, payable.length - paid.length) };
  }, [data]);

  if (loading && !data) return null;

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3" data-testid="evening-payments-panel">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-success-soft text-success">
          <CircleDollarSign className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-black text-text-primary">Оплата вечера</div>
          <div className="mt-0.5 text-[9px] text-text-muted">
            {data?.evening.closed ? 'Вечер закрыт · оплаты всё равно можно исправлять' : 'Отмечай оплату одним нажатием'}
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={Boolean(busyId)} className="grid h-9 w-9 place-items-center rounded-[10px] bg-surface-2 text-text-muted disabled:opacity-40" aria-label="Обновить оплаты">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {error ? <div className="mt-2 rounded-[10px] bg-danger-soft px-3 py-2 text-[10px] text-danger">{error}</div> : null}

      {data?.participants.length ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <div className="rounded-[10px] bg-surface-2 px-2 py-2 text-center"><div className="text-[13px] font-black text-text-primary">{summary.total}</div><div className="text-[8px] text-text-muted">к оплате</div></div>
            <div className="rounded-[10px] bg-success-soft px-2 py-2 text-center"><div className="text-[13px] font-black text-success">{summary.paid}</div><div className="text-[8px] text-success">оплатили</div></div>
            <div className="rounded-[10px] bg-danger-soft px-2 py-2 text-center"><div className="text-[13px] font-black text-danger">{summary.unpaid}</div><div className="text-[8px] text-danger">не оплатили</div></div>
          </div>

          <div className="mt-2.5 space-y-1.5">
            {data.participants.map((participant) => {
              const due = Number(participant.amount_due || 0);
              const paid = participant.payment_status === 'paid' || (due > 0 && Number(participant.amount_paid || 0) >= due);
              const waived = participant.payment_status === 'waived' || due === 0;
              const busy = busyId === participant.id;

              return (
                <div key={participant.id} className="flex min-h-[48px] items-center gap-2 rounded-[12px] bg-surface-2 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-bold text-text-primary">{participant.nickname}</div>
                    <div className={`mt-0.5 text-[9px] ${waived ? 'text-text-muted' : paid ? 'text-success' : 'text-danger'}`}>
                      {waived ? 'Без оплаты' : paid ? `Оплачено · ${money(due)}` : `Не оплачено · ${money(due)}`}
                    </div>
                  </div>

                  {waived ? (
                    <span className="shrink-0 rounded-[9px] bg-surface-1 px-2.5 py-1.5 text-[9px] font-bold text-text-muted">0 ₽</span>
                  ) : paid ? (
                    <button type="button" disabled={busy} onClick={() => void setPaid(participant, false)} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[9px] bg-success-soft px-2.5 text-[9px] font-black text-success disabled:opacity-40">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Оплатил
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void setPaid(participant, true)} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[9px] bg-danger-soft px-2.5 text-[9px] font-black text-danger disabled:opacity-40">
                      <XCircle className="h-3.5 w-3.5" /> Не оплатил
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-[11px] bg-surface-2 px-3 py-3 text-[10px] text-text-muted">Пока нет отмеченных пришедших игроков.</div>
      )}
    </section>
  );
}
