import { useEffect, useState } from 'react';

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

type PaymentPurpose = {
  id: 'evening' | 'token_topup' | 'support' | 'fundraiser';
  title: string;
  description: string;
  configured: boolean;
};

type PaymentIntent = {
  id: string;
  purpose: PaymentPurpose['id'];
  amount_rub: number;
  token_amount: number | null;
  status: string;
  description: string;
  confirmation_url: string | null;
  created_at: string | null;
  paid_at: string | null;
};

type OnlinePaymentData = {
  available: boolean;
  provider: string | null;
  setup_required: boolean;
  purposes: PaymentPurpose[];
  token_packages: Array<{ id: string; title: string; token_amount: number; price_rub: number }>;
  campaigns: Array<{
    id: string;
    title: string;
    description: string | null;
    target_amount_rub: number | null;
    collected_amount_rub: number;
    starts_at: string | null;
    ends_at: string | null;
  }>;
  recent_intents: PaymentIntent[];
};

type PaymentData = {
  summary: { amount_due: number; amount_paid: number; outstanding: number; open: number; closed: number };
  current: PaymentItem[];
  history: PaymentItem[];
  free_evening_credits: number;
  online_payment_available: boolean;
  online_payment?: OnlinePaymentData;
};

const PURPOSE_ICON: Record<PaymentPurpose['id'], string> = {
  evening: '🎟️',
  token_topup: '🪙',
  support: '🖤',
  fundraiser: '🎯',
};

const PURPOSE_HINT: Record<PaymentPurpose['id'], string> = {
  evening: 'По сумме конкретного вечера',
  token_topup: 'Фиксированные пакеты жетонов',
  support: 'Любая сумма на развитие клуба',
  fundraiser: 'В конкретную цель клуба',
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

function PaymentPurposeGrid({ online }: { online: OnlinePaymentData }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Оплатить через приложение</h2>
          <p className="mt-1 text-xs leading-5 text-white/35">Каждый платёж сохраняет своё назначение — деньги за вечер не смешиваются с жетонами, поддержкой или сборами.</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${online.available ? 'bg-emerald-400/[0.08] text-emerald-200/80' : 'bg-amber-300/[0.08] text-amber-100/60'}`}>{online.available ? 'СБП доступно' : 'Подключение'}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {online.purposes.map((purpose) => {
          const ready = online.available && purpose.configured;
          return (
            <button
              key={purpose.id}
              type="button"
              disabled={!ready}
              className={`min-h-[142px] rounded-3xl border p-3 text-left transition ${ready ? 'border-white/15 bg-white/[0.07] active:bg-white/[0.1]' : 'border-white/[0.06] bg-black/15 opacity-75'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/[0.06] text-xl">{PURPOSE_ICON[purpose.id]}</span>
                <span className="text-[9px] text-white/25">{ready ? 'Открыть ›' : purpose.configured ? 'СБП' : 'Настройка'}</span>
              </div>
              <div className="mt-3 text-sm font-semibold text-white/85">{purpose.title}</div>
              <div className="mt-1 text-[10px] leading-4 text-white/35">{PURPOSE_HINT[purpose.id]}</div>
            </button>
          );
        })}
      </div>

      {!online.available && (
        <div className="mt-3 rounded-2xl border border-amber-200/10 bg-amber-200/[0.035] px-3 py-3 text-[11px] leading-5 text-amber-50/55">
          Интерфейс и назначения платежей уже разделены. Кнопки включатся после подключения платёжного провайдера — до этого приложение не создаёт фиктивные «оплачено» и не меняет баланс жетонов.
        </div>
      )}

      {online.token_packages.length > 0 && (
        <div className="mt-3 rounded-2xl bg-black/15 px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Пакеты жетонов</div>
          <div className="mt-2 flex flex-wrap gap-2">{online.token_packages.map((item) => <span key={item.id} className="rounded-full bg-white/[0.05] px-2.5 py-1.5 text-[10px] text-white/50">{item.token_amount.toLocaleString('ru-RU')} 🪙 · {rubles(item.price_rub)}</span>)}</div>
        </div>
      )}

      {online.campaigns.length > 0 && (
        <div className="mt-3 space-y-2">{online.campaigns.map((campaign) => {
          const target = Number(campaign.target_amount_rub || 0);
          const progress = target > 0 ? Math.min(100, Math.round((campaign.collected_amount_rub / target) * 100)) : null;
          return <div key={campaign.id} className="rounded-2xl bg-black/15 px-3 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-xs font-semibold text-white/75">🎯 {campaign.title}</div>{campaign.description && <div className="mt-1 text-[10px] leading-4 text-white/30">{campaign.description}</div>}</div>{target > 0 && <div className="shrink-0 text-right text-[10px] text-white/35">{rubles(campaign.collected_amount_rub)} / {rubles(target)}</div>}</div>{progress != null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-white/45" style={{ width: `${progress}%` }} /></div>}</div>;
        })}</div>
      )}
    </section>
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
      <div className="px-1 pb-1 pt-2"><div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div><h1 className="mt-1 text-2xl font-semibold text-white">Оплата</h1><p className="mt-1 text-sm text-white/45">Вечера, жетоны, поддержка клуба и целевые сборы</p></div>

      {error && <p className="rounded-2xl border border-rose-400/10 bg-rose-400/[0.06] px-3 py-3 text-sm text-rose-100/70">{error}</p>}
      {!data ? <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-sm text-white/45">Загрузка оплаты…</div> : (
        <>
          <section className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.035] p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/35">По игровым вечерам</div>
            <div className="mt-2 text-3xl font-semibold text-white">{rubles(data.summary.outstanding)}</div>
            <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-black/20 p-3"><div className="text-lg font-semibold text-white/80">{rubles(data.summary.amount_paid)}</div><div className="mt-1 text-[11px] text-white/35">оплачено всего</div></div><div className="rounded-2xl bg-black/20 p-3"><div className="text-lg font-semibold text-white/80">{data.free_evening_credits}</div><div className="mt-1 text-[11px] text-white/35">бесплатных вечеров</div></div></div>
          </section>

          {data.online_payment && <PaymentPurposeGrid online={data.online_payment} />}

          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Текущие вечера</h2>{data.current.length ? <div className="space-y-2">{data.current.map((item) => <PaymentCard key={item.participant_id} item={item} freeCredits={data.free_evening_credits} applying={applyingId === item.participant_id} onUseFree={useFreeEvening} />)}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Сейчас задолженности и активных платежей нет.</p>}</section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">История вечеров</h2>{data.history.length ? <div className="space-y-2">{data.history.map((item) => <PaymentCard key={item.participant_id} item={item} freeCredits={0} applying={false} onUseFree={() => {}} />)}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">История оплат пока пустая.</p>}</section>
        </>
      )}
    </div>
  );
}
