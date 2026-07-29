import React, { useState } from 'react';
import {
  AlertCircle,
  DollarSign,
  UserPlus,
  ArrowRight,
  PhoneCall,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  ChevronRight,
  Calendar,
  Users,
  Clock,
  X,
} from 'lucide-react';
import { CrmOverview } from '../../lib/api.ts';

interface CRMOverviewProps {
  overview: CrmOverview | null;
  onOpenEvening: (id: string) => void;
  onOpenPlayer: (id: string) => void;
  onNavigateTab: (tab: string) => void;
  onCompleteTask?: (taskId: string) => void;
  onRefresh?: () => void;
}

export const CRMOverview: React.FC<CRMOverviewProps> = ({
  overview,
  onOpenEvening,
  onOpenPlayer,
  onNavigateTab,
  onCompleteTask,
  onRefresh,
}) => {
  // Active Bottom Sheet modal type
  const [activeSheet, setActiveSheet] = useState<
    'attention' | 'tasks' | 'unanswered' | 'unconfirmed' | 'waitlist' | null
  >(null);

  if (!overview) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-xs animate-pulse">
        Загрузка пульса CRM...
      </div>
    );
  }

  const { nextEvening, actionLists, summary } = overview;

  // 1. Attention Items calculation
  const attentionItems = [
    {
      id: 'overdue',
      title: 'Просроченные задачи',
      desc: 'Требуют срочной отработки',
      count: summary?.overdueTasksCount || actionLists?.overdueTasks?.length || 0,
      icon: AlertCircle,
      badgeStyle: 'text-danger bg-danger-soft border-danger/30',
      iconStyle: 'text-danger bg-danger-soft border-danger/30',
      tab: 'tasks',
      items: actionLists?.overdueTasks || [],
    },
    {
      id: 'newcomers',
      title: 'Новички без фидбека',
      desc: 'Был 1 визит, нужен фидбек',
      count: summary?.newcomersWithoutFollowupCount || actionLists?.newcomersAfterFirst?.length || 0,
      icon: UserPlus,
      badgeStyle: 'text-warning bg-warning-soft border-warning/30',
      iconStyle: 'text-warning bg-warning-soft border-warning/30',
      tab: 'players',
      items: actionLists?.newcomersAfterFirst || [],
    },
    {
      id: 'lapsed',
      title: 'Без визита 30+ дней',
      desc: 'Пауза в играх, стоит связаться',
      count: summary?.lapsedPlayersCount || actionLists?.lapsedPlayers?.length || 0,
      icon: PhoneCall,
      badgeStyle: 'text-accent bg-accent-soft border-accent/30',
      iconStyle: 'text-accent bg-accent-soft border-accent/30',
      tab: 'players',
      items: actionLists?.lapsedPlayers || [],
    },
    {
      id: 'unpaid',
      title: 'Долги за игры',
      desc: summary?.totalUnpaidAmount ? `${summary.totalUnpaidAmount} ₽` : 'Неоплачено',
      count: summary?.unpaidParticipantsCount || actionLists?.unpaidParticipants?.length || 0,
      icon: DollarSign,
      badgeStyle: 'text-success bg-success-soft border-success/30',
      iconStyle: 'text-success bg-success-soft border-success/30',
      tab: 'evenings',
      items: actionLists?.unpaidParticipants || [],
    },
  ].filter((item) => item.count > 0);

  const totalAttentionCount = attentionItems.reduce((sum, item) => sum + item.count, 0);

  // 2. Tasks Today
  const todayTasks = actionLists?.todayTasks || [];
  const firstTodayTask = todayTasks[0];

  // 3. Evening Participants counts
  const unansweredCount = actionLists?.unansweredInvites?.length || 0;
  const unconfirmedCount = actionLists?.unconfirmedRegistered?.length || 0;
  const waitlistCount = actionLists?.waitlistParticipants?.length || 0;

  return (
    <div className="flex-1 flex flex-col justify-between overflow-hidden min-h-0 h-full py-0.5 gap-2 sm:gap-2.5 max-w-xl mx-auto w-full">
      {/* 1. Header Title Block (Compact height ~38px) */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-text-primary tracking-tight leading-tight">
            Пульс клуба
          </h2>
          <p className="text-[11px] text-text-secondary">
            Главное по ближайшему вечеру
          </p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="w-8 h-8 bg-surface-1 hover:bg-surface-2 border border-border-soft rounded-[10px] text-text-secondary hover:text-text-primary flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0"
            title="Обновить данные"
          >
            <RefreshCw className="w-3.5 h-3.5 stroke-[1.8]" />
          </button>
        )}
      </div>

      {/* 2. Next Evening Card (Compact height ~125px-135px) */}
      <div className="card-neon-hero rounded-[14px] p-3 sm:p-3.5 flex flex-col justify-between shrink-0 space-y-2 border border-accent/70">
        {/* Card Row 1: Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-accent stroke-[2.2]" />
            <span className="text-[10px] font-bold text-accent tracking-wider uppercase">
              БЛИЖАЙШИЙ ВЕЧЕР
            </span>
          </div>
          {nextEvening && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                nextEvening.status === 'active'
                  ? 'bg-success-soft text-success border-success/30'
                  : 'bg-warning-soft text-warning border-warning/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  nextEvening.status === 'active' ? 'bg-success animate-pulse' : 'bg-warning'
                }`}
              />
              {nextEvening.status === 'active' ? 'Идёт сейчас' : 'Запланирован'}
            </span>
          )}
        </div>

        {nextEvening ? (
          <div className="space-y-2">
            {/* Row 2: Date, Time & Title */}
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-extrabold text-text-primary leading-tight truncate">
                  {new Date(nextEvening.starts_at).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    weekday: 'short',
                  })}{' '}
                  в {new Date(nextEvening.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="text-[11px] font-medium text-text-secondary truncate mt-0.5">
                  {nextEvening.title} {nextEvening.venue ? `• ${nextEvening.venue}` : ''}
                </div>
              </div>
            </div>

            {/* Row 3: Occupancy & Action */}
            {(() => {
              const totalCapacity =
                nextEvening.tables?.reduce((sum, t) => sum + (t.capacity || 10), 0) || 10;
              const totalOccupied = nextEvening.confirmedCount ?? nextEvening.registeredCount ?? 0;
              const freeSpots = Math.max(0, totalCapacity - totalOccupied);
              const fillPercent = Math.min(100, Math.round((totalOccupied / totalCapacity) * 100));

              return (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-soft/60">
                  <div className="min-w-0 flex-1 pr-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold">
                      <span className="text-text-secondary truncate">
                        Записано: <strong className="text-text-primary">{nextEvening.registeredCount || 0}</strong>{' '}
                        <span className="text-text-muted">(подтв. {nextEvening.confirmedCount || 0})</span>
                      </span>
                      <span className="text-success shrink-0 ml-1">
                        {freeSpots > 0 ? `${freeSpots} св. мест` : 'Заполнен'}
                      </span>
                    </div>
                    <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all shadow-[0_0_8px_var(--accent)]"
                        style={{ width: `${fillPercent}%` }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenEvening(nextEvening.id)}
                    className="h-[36px] btn-neon-accent font-bold rounded-[10px] px-3 text-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <span>Открыть</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
                  </button>
                </div>
              );
            })()}
          </div>
        ) : (
          /* Empty Evening State (Compact height ~90px) */
          <div className="py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-surface-2/90 border border-border-soft flex items-center justify-center text-accent shrink-0">
                <Calendar className="w-4 h-4 stroke-[1.8]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-text-primary truncate">Ближайший вечер не создан</p>
                <p className="text-[11px] text-text-secondary truncate">Создайте вечер для следующей пятницы</p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('evenings')}
              className="h-[36px] btn-neon-accent font-bold rounded-[10px] px-3 text-xs transition-all cursor-pointer shrink-0"
            >
              Создать
            </button>
          </div>
        )}
      </div>

      {/* 3. Section: "Требует внимания" (Compact single row <= 60px) */}
      <div
        onClick={() => {
          if (totalAttentionCount > 0) setActiveSheet('attention');
        }}
        className="bg-surface-1 hover:bg-surface-2 border border-border-soft rounded-[14px] px-3.5 py-2.5 flex items-center justify-between gap-2.5 transition-all cursor-pointer shrink-0 min-h-[54px]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {totalAttentionCount === 0 ? (
            <div className="w-8 h-8 rounded-[10px] bg-success-soft border border-success/30 flex items-center justify-center text-success shrink-0">
              <ShieldCheck className="w-4 h-4 stroke-[2]" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-[10px] bg-danger-soft border border-danger/30 flex items-center justify-center text-danger shrink-0">
              <AlertCircle className="w-4 h-4 stroke-[2]" />
            </div>
          )}

          <div className="min-w-0">
            {totalAttentionCount === 0 ? (
              <>
                <h4 className="text-xs font-bold text-text-primary leading-tight">Всё спокойно</h4>
                <p className="text-[11px] text-text-secondary leading-tight mt-0.5">Срочных действий нет</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-danger leading-tight">
                    Требует внимания: {totalAttentionCount}
                  </h4>
                </div>
                <p className="text-[11px] text-text-secondary truncate mt-0.5">
                  {attentionItems.map((item) => `${item.title}: ${item.count}`).join(' • ')}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {totalAttentionCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger-soft text-danger border border-danger/30">
              {totalAttentionCount}
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-text-muted" />
        </div>
      </div>

      {/* 4. Section: Задачи на сегодня (Compact single row <= 54px) */}
      <div
        onClick={() => {
          if (todayTasks.length > 0) setActiveSheet('tasks');
          else onNavigateTab('tasks');
        }}
        className="bg-surface-1 hover:bg-surface-2 border border-border-soft rounded-[14px] px-3.5 py-2.5 flex items-center justify-between gap-2.5 transition-all cursor-pointer shrink-0 min-h-[52px]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-[10px] bg-accent-soft border border-accent/30 flex items-center justify-center text-accent shrink-0">
            <Clock className="w-4 h-4 stroke-[2]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-text-primary leading-tight">Задачи на сегодня</h4>
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-surface-2 text-text-secondary border border-border-soft">
                {todayTasks.length}
              </span>
            </div>
            <p className="text-[11px] text-text-secondary truncate mt-0.5">
              {todayTasks.length > 0
                ? `Ближайшая: ${firstTodayTask?.title}`
                : 'На сегодня всё выполнено'}
            </p>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
      </div>

      {/* 5. Section: Участники вечера (Compact chips section ~72px) */}
      <div className="bg-surface-1 border border-border-soft rounded-[14px] p-2.5 flex flex-col justify-between shrink-0 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-text-primary">
          <span>Участники вечера</span>
          {nextEvening && (
            <span className="text-[10px] font-normal text-text-muted truncate max-w-[140px]">
              {nextEvening.title}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center">
          <button
            onClick={() => setActiveSheet('unanswered')}
            className="bg-surface-2 hover:bg-surface-hover border border-border-soft rounded-[10px] py-1.5 px-1 flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95"
          >
            <span className="text-[10px] text-text-secondary font-medium block">Не ответили</span>
            <span className="text-xs font-bold text-warning mt-0.5">{unansweredCount}</span>
          </button>

          <button
            onClick={() => setActiveSheet('unconfirmed')}
            className="bg-surface-2 hover:bg-surface-hover border border-border-soft rounded-[10px] py-1.5 px-1 flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95"
          >
            <span className="text-[10px] text-text-secondary font-medium block">Не подтвердили</span>
            <span className="text-xs font-bold text-accent mt-0.5">{unconfirmedCount}</span>
          </button>

          <button
            onClick={() => setActiveSheet('waitlist')}
            className="bg-surface-2 hover:bg-surface-hover border border-border-soft rounded-[10px] py-1.5 px-1 flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95"
          >
            <span className="text-[10px] text-text-secondary font-medium block">Резерв</span>
            <span className="text-xs font-bold text-text-primary mt-0.5">{waitlistCount}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BOTTOM SHEET MODALS FOR DETAILS */}
      {/* ========================================================================= */}

      {/* A. ATTENTION ITEMS BOTTOM SHEET */}
      {activeSheet === 'attention' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end p-0">
          <div
            className="fixed inset-0"
            onClick={() => setActiveSheet(null)}
          />
          <div className="relative bg-surface-1 border-t border-border-strong rounded-t-[22px] max-h-[82vh] flex flex-col shadow-2xl p-4 space-y-3 z-10 animate-slide-up">
            <div className="w-12 h-1 bg-border-strong rounded-full mx-auto shrink-0" />
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-danger" />
                <h3 className="text-base font-bold text-text-primary">Требует внимания</h3>
              </div>
              <button
                onClick={() => setActiveSheet(null)}
                className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[65vh] space-y-2.5 pr-1">
              {attentionItems.map((group) => {
                const Icon = group.icon;
                return (
                  <div key={group.id} className="bg-surface-2 border border-border-soft rounded-[14px] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-[8px] border ${group.iconStyle}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-text-primary">{group.title}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${group.badgeStyle}`}>
                        {group.count}
                      </span>
                    </div>

                    <p className="text-[11px] text-text-secondary">{group.desc}</p>

                    <button
                      onClick={() => {
                        setActiveSheet(null);
                        onNavigateTab(group.tab);
                      }}
                      className="w-full h-[36px] bg-surface-1 hover:bg-surface-hover border border-border-soft text-text-primary rounded-[10px] text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1 mt-1"
                    >
                      <span>Перейти в раздел</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* B. TODAY TASKS BOTTOM SHEET */}
      {activeSheet === 'tasks' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end p-0">
          <div
            className="fixed inset-0"
            onClick={() => setActiveSheet(null)}
          />
          <div className="relative bg-surface-1 border-t border-border-strong rounded-t-[22px] max-h-[82vh] flex flex-col shadow-2xl p-4 space-y-3 z-10 animate-slide-up">
            <div className="w-12 h-1 bg-border-strong rounded-full mx-auto shrink-0" />
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" />
                <h3 className="text-base font-bold text-text-primary">Задачи на сегодня</h3>
              </div>
              <button
                onClick={() => setActiveSheet(null)}
                className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[65vh] space-y-2 pr-1">
              {todayTasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-surface-2 border border-border-soft rounded-[14px] p-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <span className="font-semibold text-text-primary block truncate">{task.title}</span>
                    {task.player_nickname && (
                      <button
                        onClick={() => {
                          setActiveSheet(null);
                          if (task.player_id) onOpenPlayer(task.player_id);
                        }}
                        className="text-[11px] text-accent hover:underline font-medium block cursor-pointer text-left"
                      >
                        👤 {task.player_nickname}
                      </button>
                    )}
                  </div>
                  {onCompleteTask && (
                    <button
                      onClick={() => onCompleteTask(task.id)}
                      className="p-2 bg-surface-1 border border-border-soft hover:border-success/50 text-text-secondary hover:text-success rounded-[10px] cursor-pointer transition-all active:scale-95 shrink-0"
                      title="Отметить выполненной"
                    >
                      <CheckCircle2 className="w-4 h-4 stroke-[1.8]" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setActiveSheet(null);
                onNavigateTab('tasks');
              }}
              className="w-full h-[40px] bg-accent hover:bg-accent-hover text-white font-bold rounded-[12px] text-xs transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <span>Все задачи в CRM</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* C. PARTICIPANTS BOTTOM SHEET (Unanswered / Unconfirmed / Waitlist) */}
      {(activeSheet === 'unanswered' || activeSheet === 'unconfirmed' || activeSheet === 'waitlist') && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end p-0">
          <div
            className="fixed inset-0"
            onClick={() => setActiveSheet(null)}
          />
          <div className="relative bg-surface-1 border-t border-border-strong rounded-t-[22px] max-h-[82vh] flex flex-col shadow-2xl p-4 space-y-3 z-10 animate-slide-up">
            <div className="w-12 h-1 bg-border-strong rounded-full mx-auto shrink-0" />
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                <h3 className="text-base font-bold text-text-primary">
                  {activeSheet === 'unanswered'
                    ? 'Не ответили'
                    : activeSheet === 'unconfirmed'
                    ? 'Не подтвердили'
                    : 'Резерв'}
                </h3>
              </div>
              <button
                onClick={() => setActiveSheet(null)}
                className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[60vh] space-y-2 pr-1">
              {(() => {
                const list =
                  activeSheet === 'unanswered'
                    ? actionLists?.unansweredInvites
                    : activeSheet === 'unconfirmed'
                    ? actionLists?.unconfirmedRegistered
                    : actionLists?.waitlistParticipants;

                if (!list || list.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs text-text-secondary">
                      В этом списке никого нет
                    </div>
                  );
                }

                return list.map((p: any) => {
                  const tgUsername = p.telegram_username
                    ? p.telegram_username.startsWith('@')
                      ? p.telegram_username
                      : `@${p.telegram_username}`
                    : '—';

                  return (
                    <div
                      key={p.id}
                      className="bg-surface-2 border border-border-soft rounded-[14px] p-3 flex items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-surface-1 border border-border-soft flex items-center justify-center font-bold text-text-primary text-xs shrink-0">
                          {p.nickname?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-text-primary text-sm block truncate">{p.nickname}</span>
                          <span className="text-[11px] text-text-secondary block truncate">{tgUsername}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            setActiveSheet(null);
                            onOpenPlayer(p.player_id);
                          }}
                          className="px-2.5 py-1.5 bg-surface-1 hover:bg-surface-hover border border-border-soft text-text-primary rounded-[8px] text-[11px] font-semibold transition-all cursor-pointer"
                        >
                          Игрок
                        </button>
                        <button
                          onClick={() => {
                            setActiveSheet(null);
                            onOpenEvening(p.evening_id || nextEvening?.id || '');
                          }}
                          className="p-1.5 bg-surface-1 hover:bg-surface-hover border border-border-soft text-text-secondary hover:text-text-primary rounded-[8px] transition-all cursor-pointer"
                          title="К вечеру"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRMOverview;
