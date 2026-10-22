import { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, CircleDollarSign, Gift, Pencil, RefreshCw, Undo2 } from 'lucide-react';

import EveningListControls from './EveningListControls.tsx';
import EveningExtensionBlock, { type EveningExtension } from './EveningExtensionBlock.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/Dialog.tsx';
import { ratingEveningSplit } from '../../lib/ratingEveningMoney.ts';
import { formatRubleAmount as money } from '../../lib/formatRubleAmount.ts';

type PaymentParticipant = {
  id: string;
  player_id: string;
  nickname: string;
  payment_status: string;
  amount_due: number;
  /** The part of `amount_due` that is the share of an evening extension. */
  extension_due?: number;
  amount_paid: number;
  club_role?: string | null;
  judge_level?: string | null;
  fee_waived?: boolean;
  novice_free?: boolean;
  staff_exempt?: boolean;
  fee_review_required?: boolean;
};

type PaymentPayload = {
  evening: {
    id: string;
    title: string;
    status: string;
    settled_at?: string | null;
    closed: boolean;
    format?: string;
  };
  participants: PaymentParticipant[];
  extensions?: EveningExtension[];
};



export default function EveningPaymentsPanel({ eveningId, initialFilter = 'all' }: { eveningId: string; initialFilter?: 'all' | 'paid' | 'unpaid' }) {
  const [data, setData] = useState<PaymentPayload | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>(initialFilter);
  const [giftTarget, setGiftTarget] = useState<PaymentParticipant | null>(null);
  const [remindOpen, setRemindOpen] = useState(false);
  const [remindBusy, setRemindBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // «Сумма»: a part of the price received by hand (owner, 2026-10-22).
  const [amountTarget, setAmountTarget] = useState<PaymentParticipant | null>(null);
  const [amountText, setAmountText] = useState('');

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
    setBusyIds(new Set());
    void load();
  }, [eveningId]);

  const setPaid = async (participant: PaymentParticipant, paid: boolean) => {
    if (busyIds.has(participant.id)) return;
    const previousParticipant = participant;
    setBusyIds((current) => new Set(current).add(participant.id));
    setError(null);
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
      // The row is already in the requested state. Do not replace the whole payload
      // with the server response: that used to make each tap visually reload the list
      // and prevented an organizer from marking several people in quick succession.
    } catch (saveError: any) {
      setData((current) => current ? {
        ...current,
        participants: current.participants.map((item) => (
          item.id === participant.id ? previousParticipant : item
        )),
      } : current);
      setError(saveError?.message || 'Не удалось изменить оплату');
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(participant.id);
        return next;
      });
    }
  };

  const openAmount = (participant: PaymentParticipant) => {
    setAmountText(String(Math.max(0, Number(participant.amount_paid || 0))));
    setAmountTarget(participant);
  };

  const saveAmount = async () => {
    const participant = amountTarget;
    if (!participant || busyIds.has(participant.id)) return;
    const amount = Number(amountText.replace(',', '.'));
    const due = Number(participant.amount_due || 0);
    if (!amountText.trim() || !Number.isFinite(amount) || amount < 0 || amount > due) {
      setError(`Введи сумму от 0 до ${money(due)}`);
      return;
    }
    setBusyIds((current) => new Set(current).add(participant.id));
    setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/payments/${encodeURIComponent(participant.id)}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_paid: amount }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить сумму');
      setData(body as PaymentPayload);
      setAmountTarget(null);
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить сумму');
    } finally {
      setBusyIds((current) => { const next = new Set(current); next.delete(participant.id); return next; });
    }
  };

  // «Подарить вечер» (owner, 2026-10-05): the player owes nothing for this evening; it is the ordinary waiver, and it can be taken back.
  const setWaived = async (participant: PaymentParticipant, waived: boolean) => {
    if (busyIds.has(participant.id)) return;
    setBusyIds((current) => new Set(current).add(participant.id));
    setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/payments/${encodeURIComponent(participant.id)}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waived, reason: waived ? 'Подарочный вечер' : undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось изменить освобождение от оплаты');
      setData(body as PaymentPayload);
    } catch (waiveError: any) {
      setError(waiveError?.message || 'Не удалось изменить освобождение от оплаты');
    } finally {
      setBusyIds((current) => { const next = new Set(current); next.delete(participant.id); return next; });
      setGiftTarget(null);
    }
  };

  // «Напомнить должникам» (owner, 2026-10-05): a personal Telegram/VK message to everybody who still owes, at most one a day each.
  const remindDebtors = async () => {
    setRemindBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/payment-reminders`, { method: 'POST', credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось отправить напоминания');
      const parts = [`Отправлено: ${body.queued || 0}`];
      if (body.skipped_recent) parts.push(`уже напоминали сегодня: ${body.skipped_recent}`);
      if (body.undeliverable) parts.push(`без Telegram/VK или с выключенными уведомлениями: ${body.undeliverable}`);
      setNotice(parts.join(' · '));
    } catch (remindError: any) {
      setError(remindError?.message || 'Не удалось отправить напоминания');
    } finally {
      setRemindBusy(false); setRemindOpen(false);
    }
  };

  const summary = useMemo(() => {
    const participants = data?.participants || [];
    const payable = participants.filter((item) => Number(item.amount_due || 0) > 0 && item.payment_status !== 'waived');
    const paid = payable.filter((item) => item.payment_status === 'paid' || Number(item.amount_paid || 0) >= Number(item.amount_due || 0));
    return { total: payable.length, paid: paid.length, unpaid: Math.max(0, payable.length - paid.length) };
  }, [data]);

  const visibleParticipants = (data?.participants || []).filter((item) => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    if (query) return item.nickname.toLocaleLowerCase('ru-RU').includes(query);
    if (filter === 'all') return true;
    const payable = Number(item.amount_due || 0) > 0 && item.payment_status !== 'waived';
    const paid = item.payment_status === 'paid' || Number(item.amount_paid || 0) >= Number(item.amount_due || 0);
    return payable && (filter === 'paid' ? paid : !paid);
  });

  // 0 ₽ means different things: an explicit exemption, a newcomer's free visit, or (CASUAL) no played games yet —
  // the regular price is 100 ₽ per completed game, so before games the amount is simply not accrued.
  const waivedLabel = (participant: PaymentParticipant) => {
    if (participant.novice_free) return 'Бесплатно · вечер новичка';
    if (participant.fee_waived) return 'Освобождён от оплаты';
    if (participant.staff_exempt) return 'Организатор вечера · без оплаты';
    if (participant.fee_review_required) return 'Освобождение на проверке';
    if (data?.evening.format === 'CASUAL' && !data.evening.closed) return 'Пока 0 ₽ · считается по сыгранным играм';
    return 'Без оплаты';
  };

  // «Все» shows two blocks, the debtors first; a search or the «Оплатили / Не оплатили» chips keep one flat list.
  const groupedView = !search.trim() && filter === 'all';
  const paymentGroups = (() => {
    const unpaid: PaymentParticipant[] = [];
    const paidItems: PaymentParticipant[] = [];
    const free: PaymentParticipant[] = [];
    for (const item of data?.participants || []) {
      const due = Number(item.amount_due || 0);
      if (item.payment_status === 'waived' || due === 0) free.push(item);
      else if (item.payment_status === 'paid' || Number(item.amount_paid || 0) >= due) paidItems.push(item);
      else unpaid.push(item);
    }
    // The money still owed by the debtors, and the money actually received from those who paid (not the price list).
    const owed = (items: PaymentParticipant[]) => items.reduce((total, item) => total + Math.max(0, Number(item.amount_due || 0) - Math.max(0, Number(item.amount_paid || 0))), 0);
    const received = (items: PaymentParticipant[]) => items.reduce((total, item) => total + Math.max(0, Number(item.amount_paid || 0)), 0);
    return [
      { id: 'unpaid', title: 'Не оплатили', tone: 'text-danger', items: unpaid, amount: owed(unpaid) as number | null },
      { id: 'paid', title: 'Оплатили', tone: 'text-success', items: paidItems, amount: received(paidItems) as number | null },
      { id: 'free', title: 'Без оплаты', tone: 'text-text-muted', items: free, amount: null as number | null },
    ];
  })();

  const renderRow = (participant: PaymentParticipant) => {
    const due = Number(participant.amount_due || 0);
    const paid = participant.payment_status === 'paid' || (due > 0 && Number(participant.amount_paid || 0) >= due);
    const waived = participant.payment_status === 'waived' || due === 0;
    const received = Math.max(0, Number(participant.amount_paid || 0));
    const partial = !paid && !waived && received > 0;
    const busy = busyIds.has(participant.id);
    const canGift = data?.evening.format === 'CASUAL' || data?.evening.format === 'NOVICE';
    const canEditAmount = !waived;

    return (
      <div key={participant.id} data-testid={`evening-payment-row-${participant.id}`} className="flex min-h-[48px] items-center gap-2 rounded-[12px] bg-surface-2 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-bold text-text-primary">{participant.nickname}</div>
          <div className={`mt-0.5 text-[10px] ${waived ? 'text-text-muted' : paid ? 'text-success' : 'text-danger'}`}>
            {waived ? waivedLabel(participant) : paid ? `Оплачено · ${money(due)}` : partial ? `Оплачено ${money(received)} из ${money(due)} · долг ${money(due - received)}` : `Не оплачено · ${money(due)}`}{!waived && Number(participant.extension_due || 0) > 0 ? ` (вечер ${money(due - Number(participant.extension_due))} + продление ${money(Number(participant.extension_due))})` : ''}
          </div>
        </div>

        {waived ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-[9px] bg-surface-1 px-2.5 py-1.5 text-[10px] font-bold text-text-muted">0 ₽</span>
            {participant.fee_waived && canGift ? (
              <button type="button" disabled={busy} onClick={() => void setWaived(participant, false)} className="inline-flex min-h-[44px] items-center rounded-[9px] bg-surface-1 px-2.5 text-[10px] font-black text-text-muted disabled:opacity-40">Вернуть оплату</button>
            ) : null}
          </div>
        ) : paid ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {canEditAmount ? (
              <button type="button" disabled={busy} data-testid={`payment-amount-${participant.id}`} onClick={() => openAmount(participant)} aria-label={`Ввести сумму оплаты: ${participant.nickname}`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[9px] bg-surface-1 text-text-muted disabled:opacity-40">
                <Pencil className="h-4 w-4" />
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => void setPaid(participant, false)} className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-[9px] bg-surface-1 px-2.5 text-[10px] font-black text-text-secondary disabled:opacity-40">
              <Undo2 className="h-3.5 w-3.5" /> Снять оплату
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            {canGift ? (
              <button type="button" disabled={busy} data-testid={`gift-evening-${participant.id}`} onClick={() => setGiftTarget(participant)} aria-label={`Подарить вечер: ${participant.nickname}`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[9px] bg-surface-1 text-text-muted disabled:opacity-40">
                <Gift className="h-4 w-4" />
              </button>
            ) : null}
            {canEditAmount ? (
              <button type="button" disabled={busy} data-testid={`payment-amount-${participant.id}`} onClick={() => openAmount(participant)} aria-label={`Ввести сумму оплаты: ${participant.nickname}`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[9px] bg-surface-1 text-text-muted disabled:opacity-40">
                <Pencil className="h-4 w-4" />
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => void setPaid(participant, true)} className="inline-flex min-h-[44px] items-center gap-1 rounded-[9px] bg-success-soft px-2.5 text-[10px] font-black text-success disabled:opacity-40">
              <CheckCircle2 className="h-3.5 w-3.5" /> Принять оплату
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading && !data) return null;

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3" data-testid="evening-payments-panel">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-success-soft text-success">
          <CircleDollarSign className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-black text-text-primary">Оплата вечера</div>
          <div className="mt-0.5 text-[10px] text-text-muted">
            {data?.evening.closed ? 'Вечер закрыт · оплаты всё равно можно исправлять' : 'Отмечай оплату одним нажатием'}
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={busyIds.size > 0} className="grid h-11 w-11 place-items-center rounded-[10px] bg-surface-2 text-text-muted disabled:opacity-40" aria-label="Обновить оплаты">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {error ? <div className="mt-2 rounded-[10px] bg-danger-soft px-3 py-2 text-[10px] text-danger">{error}</div> : null}
      {notice ? <div role="status" className="mt-2 rounded-[10px] bg-success-soft px-3 py-2 text-[10px] text-success">{notice}</div> : null}
      {summary.unpaid > 0 && data?.evening.closed ? (
        <button type="button" data-testid="remind-debtors" onClick={() => setRemindOpen(true)} disabled={remindBusy} className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[11px] bg-warning-soft px-3 text-[11px] font-black text-warning disabled:opacity-40">
          <BellRing className="h-4 w-4" /> Напомнить должникам ({summary.unpaid})
        </button>
      ) : null}

      {data ? <EveningExtensionBlock eveningId={eveningId} extensions={data.extensions || []} closed={data.evening.closed} onChanged={(payload) => setData(payload as PaymentPayload)} /> : null}

      {data?.evening.format === 'RATING' && data.participants.length ? (() => {
        // Internal bookkeeping (organizers only): how the collected entry fees are split.
        const collected = data.participants.reduce((sum, item) => sum + Math.max(0, Number(item.amount_paid || 0)), 0);
        const expected = data.participants.reduce((sum, item) => sum + Math.max(0, Number(item.amount_due || 0)), 0);
        const split = ratingEveningSplit(collected);
        return (
          <div className="mt-3 rounded-[12px] bg-surface-2 p-2.5" data-testid="rating-evening-split">
            <div className="text-[12px] font-bold text-text-primary">Взносы: собрано {money(collected)} из {money(expected)}</div>
            <div className="mt-1 grid grid-cols-3 gap-1.5 text-center">
              {[['Победителю', split.winner], ['Судье', split.judge], ['В фонд сезона', split.fund]].map(([label, value]) => (
                <div key={String(label)} className="rounded-[10px] bg-surface-1 px-1 py-1.5">
                  <div className="text-[13px] font-bold text-text-primary">{money(Number(value))}</div>
                  <div className="text-[10px] text-text-muted">{label}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })() : null}

      {data?.participants.length ? (
        <>
          <div className="mt-3"><EveningListControls search={search} onSearch={setSearch} filter={filter} onFilter={setFilter}
            searchLabel="Найти игрока в оплатах"
            filters={[{ id: 'all', label: 'Все', count: data.participants.length }, { id: 'paid', label: 'Оплатили', count: summary.paid }, { id: 'unpaid', label: 'Не оплатили', count: summary.unpaid }]} /></div>

          <div className="mt-2.5 space-y-1.5">
            {groupedView ? paymentGroups.map((group) => group.items.length ? (
              <div key={group.id} data-testid={`evening-payments-group-${group.id}`} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 px-1 pt-1.5">
                  <span className={`text-[12px] font-black ${group.tone}`}>{group.title} · {group.items.length}</span>
                  {group.amount !== null ? <span className="text-[11px] font-bold text-text-muted">{money(group.amount)}</span> : null}
                </div>
                {group.items.map(renderRow)}
              </div>
            ) : null) : visibleParticipants.map(renderRow)}
            {!visibleParticipants.length ? <p role="status" className="p-3 text-center text-[11px] text-text-muted">{search.trim() ? 'Игрок не найден в списке оплат.' : filter === 'unpaid' ? 'Все оплаты отмечены.' : 'Отмеченных оплат пока нет.'}</p> : null}
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-[11px] bg-surface-2 px-3 py-3 text-[10px] text-text-muted">Пока нет отмеченных пришедших игроков.</div>
      )}
      <Dialog open={Boolean(amountTarget)} onOpenChange={(next) => { if (!next && !(amountTarget && busyIds.has(amountTarget.id))) setAmountTarget(null); }}>
        <DialogContent className="max-w-sm" data-testid="payment-amount-dialog">
          <DialogTitle>Сколько оплатил{amountTarget ? ` · ${amountTarget.nickname}` : ''}?</DialogTitle>
          {amountTarget ? (() => {
            const due = Number(amountTarget.amount_due || 0);
            const typed = Number(amountText.replace(',', '.'));
            const valid = amountText.trim() !== '' && Number.isFinite(typed) && typed >= 0 && typed <= due;
            return (
              <>
                <DialogDescription className="mt-1">К оплате {money(due)}. Впиши, сколько уже получено, — остаток останется долгом.</DialogDescription>
                <input type="number" inputMode="decimal" min={0} max={due} step="any" autoFocus aria-label="Сколько получено, ₽" value={amountText} onChange={(event) => setAmountText(event.target.value)} className="mt-3 min-h-[44px] w-full rounded-[11px] border border-border-soft bg-surface-2 px-3 text-[15px] text-text-primary" />
                <div className="mt-2 text-[12px] text-text-muted">{valid ? (typed >= due ? 'Оплачено полностью' : `Останется долг: ${money(due - typed)}`) : `Сумма от 0 до ${money(due)}`}</div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setAmountTarget(null)} disabled={busyIds.has(amountTarget.id)} className="min-h-[44px] rounded-[11px] bg-surface-2 text-[12px] font-bold text-text-secondary disabled:opacity-40">Отмена</button>
                  <button type="button" onClick={() => void saveAmount()} disabled={!valid || busyIds.has(amountTarget.id)} className="min-h-[44px] rounded-[11px] bg-success-soft text-[12px] font-black text-success disabled:opacity-40">Сохранить</button>
                </div>
              </>
            );
          })() : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(giftTarget)}
        title="Подарить вечер?"
        description={giftTarget ? `${giftTarget.nickname} ничего не должен за этот вечер: долг снимется, в учёте это освобождение от оплаты. Это можно отменить кнопкой «Вернуть оплату».` : undefined}
        confirmLabel="Подарить"
        busy={Boolean(giftTarget && busyIds.has(giftTarget.id))}
        onCancel={() => setGiftTarget(null)}
        onConfirm={() => { if (giftTarget) void setWaived(giftTarget, true); }}
      />
      <ConfirmDialog
        open={remindOpen}
        title="Напомнить должникам?"
        description={`Бот напишет лично ${summary.unpaid} игрокам, которые ещё не оплатили вечер: сколько и за что, и как перевести. Не чаще одного раза в сутки на человека.`}
        confirmLabel="Напомнить"
        busy={remindBusy}
        onCancel={() => setRemindOpen(false)}
        onConfirm={() => void remindDebtors()}
      />
    </section>
  );
}
