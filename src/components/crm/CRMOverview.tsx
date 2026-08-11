import React, { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowRight, Calendar, Check, CheckCircle2, Gamepad2, LayoutGrid, RefreshCw, Send, Users } from 'lucide-react';
import { api, type CrmOverview } from '../../lib/api.ts';
import { buildNextEveningAction, buildTodayActionQueue, type TodayActionItem } from '../../lib/organizerUx.ts';

interface CRMOverviewProps {
  overview: CrmOverview | null;
  onOpenEvening: (id: string) => void;
  onOpenEveningAdd?: (id: string) => void;
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
const formatLabel = (format: string) => format === 'NOVICE' ? 'Новичковый вечер' : format === 'TOURNAMENT' ? 'Турнир' : 'Клубный вечер';

export const CRMOverview: React.FC<CRMOverviewProps> = ({ overview, onOpenEvening, onOpenPlayer, onNavigateTab, onCreateEvening, onCompleteTask, onRefresh }) => {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ key: string; message: string } | null>(null);
  const queue = useMemo(() => buildTodayActionQueue(overview), [overview]);
  const nextEveningAction = useMemo(() => buildNextEveningAction(overview), [overview]);

  if (!overview) return <div className="flex min-h-[46vh] items-center justify-center text-[13px] text-text-secondary">Загружаем сегодняшний план…</div>;

  const { nextEvening } = overview;
  const shownQueue = queue.filter((item) => item.key !== nextEveningAction?.key).slice(0, 7);

  const runAction = async (item: TodayActionItem) => {
    if (busyKey) return;
    setActionError(null);
    if (item.kind.startsWith('evening_')) {
      if (item.eveningId) onOpenEvening(item.eveningId);
      return;
    }
    if (item.kind === 'newcomer_followup' || item.kind === 'lapsed_player') {
      if (item.playerId) onOpenPlayer(item.playerId);
      return;
    }
    setBusyKey(item.key);
    try {
      if (item.kind === 'overdue_task' || item.kind === 'today_task' || item.kind === 'undated_task') {
        if (onCompleteTask) await onCompleteTask(item.payload.id);
        else await api.completeTask(item.payload.id);
      } else if (item.kind === 'unpaid') {
        await api.updateParticipant(item.payload.id, { amount_paid: Number(item.payload.amount_due || 0), payment_status: 'paid' });
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
          <p className="mt-1 text-[13px] text-text-secondary">Ближайший вечер и один следующий шаг, который важнее всего прямо сейчас.</p>
        </div>
        {onRefresh ? <button type="button" aria-label="Обновить" onClick={() => void onRefresh()} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-1 text-text-secondary"><RefreshCw className="h-4.5 w-4.5" /></button> : null}
      </div>

      {nextEvening ? (() => {
        const evening: any = nextEvening;
        const when = formatDateTime(evening.starts_at);
        const going = Number(evening.goingCount || 0);
        const later = Number(evening.laterCount || 0);
        const thinking = Number(evening.thinkingCount || 0);
        const declined = Number(evening.declinedCount || 0);
        const responseUnanswered = Number(evening.unansweredCount || 0);
        const announcement = evening.announcementSummary || {};
        const sent = Number(announcement.sent || 0);
        const answered = Number(announcement.answered || 0);
        const dmUnanswered = Number(announcement.unanswered || 0);
        const failed = Number(announcement.failed || 0);
        const notSent = Number(announcement.not_sent || 0);
        const announcementAudience = Number(announcement.audience || 0);
        const expected = Number(evening.expectedPlayersCount || going + later);
        const seated = Number(evening.seatedExpectedCount || 0);
        const unseated = Number(evening.unseatedExpectedCount || 0);
        const games = Number(evening.gamesCount || 0);
        const completedGames = Number(evening.completedGamesCount || 0);
        const isDraft = evening.status === 'draft';
        const isActive = evening.status === 'active';
        return (
          <section className="overflow-hidden rounded-[20px] border border-border-soft bg-surface-1">
            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent"><Calendar className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-accent">{formatLabel(evening.format)}</p>
                  <h3 className="mt-1 break-words text-[19px] font-black leading-tight text-text-primary">{evening.title}</h3>
                  <p className="mt-1 text-[13px] text-text-secondary">{when.date} · {when.time}{evening.venue ? ` · ${evening.venue}` : ''}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                <div className="flex min-h-[54px] items-center gap-3 rounded-[13px] bg-surface-2 px-3">
                  <Send className={`h-5 w-5 shrink-0 ${failed ? 'text-danger' : isDraft || notSent ? 'text-warning' : 'text-success'}`} />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[12px] text-text-primary">Личная рассылка</strong>
                    <span className="text-[10px] leading-4 text-text-muted">
                      {isDraft
                        ? 'Станет доступна после публикации вечера'
                        : `${sent} доставлено${announcementAudience ? ` из ${announcementAudience}` : ''} · ${answered} ответили${notSent ? ` · ${notSent} ещё не отправлено` : ''}${failed ? ` · ${failed} ошибок` : ''}`}
                    </span>
                  </span>
                </div>

                <div className="flex min-h-[54px] items-center gap-3 rounded-[13px] bg-surface-2 px-3">
                  <Users className={`h-5 w-5 shrink-0 ${dmUnanswered || responseUnanswered ? 'text-warning' : 'text-success'}`} />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[12px] text-text-primary">Ответы игроков</strong>
                    <span className="text-[10px] leading-4 text-text-muted">{going} идут · {later} позже · {thinking} думают · {declined} не идут{dmUnanswered ? ` · ${dmUnanswered} ждём после личного анонса` : responseUnanswered ? ` · ${responseUnanswered} без ответа` : ''}</span>
                  </span>
                </div>

                <div className="flex min-h-[54px] items-center gap-3 rounded-[13px] bg-surface-2 px-3">
                  <LayoutGrid className={`h-5 w-5 shrink-0 ${unseated ? 'text-warning' : expected ? 'text-success' : 'text-text-muted'}`} />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[12px] text-text-primary">Рассадка</strong>
                    <span className="text-[10px] leading-4 text-text-muted">{expected ? `Рассажено ${seated} из ${expected}${unseated ? ` · без стола ${unseated}` : ''}` : 'Пока нет игроков со статусом «иду» или «приду позже»'}</span>
                  </span>
                </div>

                {isActive ? <div className="flex min-h-[54px] items-center gap-3 rounded-[13px] bg-surface-2 px-3">
                  <Gamepad2 className={`h-5 w-5 shrink-0 ${games > completedGames ? 'text-accent' : games ? 'text-success' : 'text-warning'}`} />
                  <span className="min-w-0 flex-1"><strong className="block text-[12px] text-text-primary">Игры</strong><span className="text-[10px] leading-4 text-text-muted">{games ? `Завершено ${completedGames} из ${games}` : 'Первая игра ещё не создана'}</span></span>
                </div> : null}
              </div>

              {nextEveningAction ? <div className="mt-4 rounded-[15px] border border-accent/25 bg-accent-soft p-3.5">
                <div className="flex items-start gap-3">
                  {nextEveningAction.kind === 'evening_delivery' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" /> : <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 text-accent" />}
                  <div className="min-w-0 flex-1"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">Следующий шаг</span><strong className="mt-0.5 block text-[13px] text-text-primary">{nextEveningAction.title}</strong><span className="mt-1 block text-[11px] leading-4 text-text-secondary">{nextEveningAction.reason}</span></div>
                </div>
                <button type="button" onClick={() => void runAction(nextEveningAction)} className="mt-3 min-h-[44px] w-full rounded-[11px] bg-accent px-3 text-[12px] font-bold text-white">{nextEveningAction.actionLabel}</button>
              </div> : !isActive ? <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-success-soft px-3.5 py-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-success" /><div><strong className="block text-[12px] text-text-primary">Подготовка выглядит завершённой</strong><span className="text-[10px] leading-4 text-text-muted">Критичных действий по рассылке, ответам и рассадке сейчас нет.</span></div></div> : null}
            </div>
            <div className="border-t border-border-soft p-3">
              <button type="button" onClick={() => onOpenEvening(evening.id)} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border border-border-soft bg-surface-2 px-4 text-[13px] font-bold text-text-primary">Открыть весь вечер <ArrowRight className="h-4 w-4" /></button>
            </div>
          </section>
        );
      })() : (
        <section className="rounded-[20px] border border-border-soft bg-surface-1 p-5 text-center">
          <Calendar className="mx-auto h-8 w-8 text-text-muted" />
          <h3 className="mt-3 text-[16px] font-bold text-text-primary">Ближайший вечер не создан</h3>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-text-secondary">Создай следующее событие — дальше приложение само будет вести по подготовке.</p>
          <button type="button" onClick={onCreateEvening} className="mt-4 min-h-[48px] rounded-[13px] bg-accent px-5 text-[13px] font-bold text-white">Создать вечер</button>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div><h3 className="text-[18px] font-black text-text-primary">Остальное внимание</h3><p className="mt-0.5 text-[12px] text-text-secondary">Задачи клуба после главного шага по ближайшему вечеру.</p></div>
          {queue.length - (nextEveningAction ? 1 : 0) > shownQueue.length ? <button type="button" onClick={() => onNavigateTab('tasks')} className="min-h-[44px] shrink-0 text-[12px] font-bold text-accent">Показать всё</button> : null}
        </div>
        {shownQueue.length === 0 ? (
          <div className="flex min-h-[88px] items-center gap-3 rounded-[18px] border border-border-soft bg-surface-1 px-4 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success-soft text-success"><Check className="h-5 w-5" /></span>
            <div><strong className="block text-[14px] text-text-primary">Других срочных действий нет</strong><span className="mt-0.5 block text-[12px] text-text-secondary">Можно сосредоточиться на ближайшем вечере.</span></div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-1">
            {shownQueue.map((item, index) => {
              const busy = busyKey === item.key;
              const inlineError = actionError?.key === item.key ? actionError.message : null;
              return <div key={item.key} className={`${index ? 'border-t border-border-soft' : ''} px-3.5 py-3`}>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => item.playerId && onOpenPlayer(item.playerId)} disabled={!item.playerId} className="min-w-0 flex-1 text-left disabled:cursor-default"><strong className="block break-words text-[14px] font-bold text-text-primary">{item.title}</strong><span className="mt-0.5 block text-[12px] leading-4 text-text-secondary">{item.reason}</span></button>
                  <button type="button" disabled={Boolean(busyKey)} onClick={() => void runAction(item)} className={`min-h-[44px] shrink-0 rounded-[11px] px-3 text-[12px] font-bold disabled:opacity-50 ${item.priority <= 1 ? 'bg-accent text-white' : 'border border-border-soft bg-surface-2 text-text-primary'}`}>{busy ? '…' : item.actionLabel}</button>
                </div>
                {inlineError ? <div className="mt-2 flex items-start gap-1.5 text-[11px] text-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {inlineError}</div> : null}
              </div>;
            })}
          </div>
        )}
        <button type="button" onClick={() => onNavigateTab('tasks')} className="inline-flex min-h-[44px] items-center gap-2 text-[12px] font-bold text-text-secondary"><CheckCircle2 className="h-4 w-4" /> Все задачи</button>
      </section>
    </div>
  );
};

export default CRMOverview;
