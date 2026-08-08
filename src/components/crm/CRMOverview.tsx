import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { api, type CrmOverview } from '../../lib/api.ts';
import { buildTodayActionQueue, type TodayActionItem } from '../../lib/organizerUx.ts';

interface CRMOverviewProps {
  overview: CrmOverview | null;
  onOpenEvening: (id: string) => void;
  onOpenEveningAdd: (id: string) => void;
  onOpenPlayer: (id: string) => void;
  onNavigateTab: (tab: string) => void;
  onCreateEvening: () => void;
  onCompleteTask?: (taskId: string) => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
}

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return {
    date: date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }),
    time: date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  };
};

export const CRMOverview: React.FC<CRMOverviewProps> = ({
  overview,
  onOpenEvening,
  onOpenEveningAdd,
  onOpenPlayer,
  onNavigateTab,
  onCreateEvening,
  onCompleteTask,
  onRefresh,
}) => {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ key: string; message: string } | null>(null);

  const queue = useMemo(() => buildTodayActionQueue(overview), [overview]);

  if (!overview) {
    return (
      <div className="flex min-h-[46vh] items-center justify-center text-[13px] text-text-secondary">
        Загружаем сегодняшний план…
      </div>
    );
  }

  const { nextEvening } = overview;
  const shownQueue = queue.slice(0, 7);

  const runAction = async (item: TodayActionItem) => {
    if (busyKey) return;
    setActionError(null);

    if (item.kind === 'unanswered_invite' || item.kind === 'newcomer_followup' || item.kind === 'lapsed_player') {
      if (item.playerId) onOpenPlayer(item.playerId);
      return;
    }

    setBusyKey(item.key);
    try {
      if (item.kind === 'overdue_task' || item.kind === 'today_task' || item.kind === 'undated_task') {
        if (onCompleteTask) await onCompleteTask(item.payload.id);
        else await api.completeTask(item.payload.id);
      } else if (item.kind === 'unconfirmed_registration') {
        await api.updateParticipant(item.payload.id, { registration_status: 'confirmed' });
        await onRefresh?.();
      } else if (item.kind === 'unpaid') {
        const amountDue = Number(item.payload.amount_due || 0);
        await api.updateParticipant(item.payload.id, {
          amount_paid: amountDue,
          payment_status: 'paid',
        });
        await onRefresh?.();
      }
    } catch (err: any) {
      setActionError({ key: item.key, message: err?.message || 'Не удалось выполнить действие' });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-black leading-tight tracking-tight text-text-primary">Сегодня</h2>
          <p className="mt-1 text-[13px] text-text-secondary">Ближайший вечер и действия, которые требуют твоего внимания.</p>
        </div>
        {onRefresh ? (
          <button
            type="button"
            aria-label="Обновить"
            onClick={() => void onRefresh()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <RefreshCw className="h-4.5 w-4.5" />
          </button>
        ) : null}
      </div>

      {nextEvening ? (() => {
        const when = formatDateTime(nextEvening.starts_at);
        const registered = Number(nextEvening.registeredCount || 0);
        const confirmed = Number(nextEvening.confirmedCount || 0);
        const waiting = Number(nextEvening.invitedCount || 0) + registered;
        const waitlist = Number(nextEvening.waitlistCount || 0);
        const occupied = registered + confirmed;
        const capacity = Math.max(1, Number(nextEvening.capacity || nextEvening.tables?.reduce((sum, table) => sum + Number(table.capacity || 0), 0) || 1));
        const freeSpots = Math.max(0, capacity - occupied);
        const progress = Math.min(100, Math.round((occupied / capacity) * 100));

        return (
          <section className="overflow-hidden rounded-[20px] border border-border-soft bg-surface-1">
            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent">
                  <Calendar className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-accent">Ближайший вечер</p>
                  <h3 className="mt-1 break-words text-[19px] font-black leading-tight text-text-primary">{nextEvening.title}</h3>
                  <p className="mt-1 text-[13px] text-text-secondary">
                    {when.date} · {when.time}{nextEvening.venue ? ` · ${nextEvening.venue}` : ''}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
                {[
                  ['Участники', occupied],
                  ['Подтверждены', confirmed],
                  ['Ждём ответа', waiting],
                  ['Резерв', waitlist],
                  ['Свободно', freeSpots],
                ].map(([label, value]) => (
                  <div key={String(label)} className="min-w-0">
                    <span className="block text-[11px] font-medium text-text-muted">{label}</span>
                    <strong className="mt-0.5 block text-[18px] font-black text-text-primary">{value}</strong>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-text-muted">
                  <span>Заполненность</span>
                  <span>{occupied} / {capacity}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 border-t border-border-soft p-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onOpenEvening(nextEvening.id)}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white"
              >
                Открыть вечер <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onOpenEveningAdd(nextEvening.id)}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[13px] border border-border-soft bg-surface-2 px-4 text-[13px] font-bold text-text-primary"
              >
                <Plus className="h-4 w-4 text-accent" /> Добавить / пригласить
              </button>
            </div>
          </section>
        );
      })() : (
        <section className="rounded-[20px] border border-border-soft bg-surface-1 p-5 text-center">
          <Calendar className="mx-auto h-8 w-8 text-text-muted" />
          <h3 className="mt-3 text-[16px] font-bold text-text-primary">Ближайший вечер не создан</h3>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-text-secondary">Создай следующее событие — после этого здесь появятся заполненность и рабочая очередь.</p>
          <button
            type="button"
            onClick={onCreateEvening}
            className="mt-4 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[13px] bg-accent px-5 text-[13px] font-bold text-white"
          >
            <Plus className="h-4 w-4" /> Создать вечер
          </button>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-black text-text-primary">Сделать сейчас</h3>
            <p className="mt-0.5 text-[12px] text-text-secondary">Одна очередь вместо нескольких CRM-блоков.</p>
          </div>
          {queue.length > shownQueue.length ? (
            <button type="button" onClick={() => onNavigateTab('tasks')} className="min-h-[44px] shrink-0 text-[12px] font-bold text-accent">
              Показать всё
            </button>
          ) : null}
        </div>

        {shownQueue.length === 0 ? (
          <div className="flex min-h-[88px] items-center gap-3 rounded-[18px] border border-border-soft bg-surface-1 px-4 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success-soft text-success"><Check className="h-5 w-5" /></span>
            <div>
              <strong className="block text-[14px] text-text-primary">На сегодня всё готово</strong>
              <span className="mt-0.5 block text-[12px] text-text-secondary">Срочных действий сейчас нет.</span>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-1">
            {shownQueue.map((item, index) => {
              const busy = busyKey === item.key;
              const inlineError = actionError?.key === item.key ? actionError.message : null;
              return (
                <div key={item.key} className={`${index ? 'border-t border-border-soft' : ''} px-3.5 py-3`}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => item.playerId && onOpenPlayer(item.playerId)}
                      disabled={!item.playerId}
                      className="min-w-0 flex-1 text-left disabled:cursor-default"
                    >
                      <strong className="block break-words text-[14px] font-bold text-text-primary">{item.title}</strong>
                      <span className="mt-0.5 block text-[12px] leading-4 text-text-secondary">{item.reason}</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => void runAction(item)}
                      className={`min-h-[44px] shrink-0 rounded-[11px] px-3 text-[12px] font-bold disabled:opacity-50 ${item.priority <= 2 ? 'bg-accent text-white' : 'border border-border-soft bg-surface-2 text-text-primary'}`}
                    >
                      {busy ? '…' : item.actionLabel}
                    </button>
                  </div>
                  {inlineError ? (
                    <div className="mt-2 flex items-start gap-1.5 text-[11px] text-danger">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {inlineError}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => onNavigateTab('tasks')}
          className="inline-flex min-h-[44px] items-center gap-2 text-[12px] font-bold text-text-secondary hover:text-text-primary"
        >
          <CheckCircle2 className="h-4 w-4" /> Все задачи
        </button>
      </section>
    </div>
  );
};

export default CRMOverview;
