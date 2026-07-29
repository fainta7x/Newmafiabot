import React, { useState } from 'react';
import {
  Calendar,
  AlertCircle,
  DollarSign,
  Clock,
  UserPlus,
  ArrowRight,
  PhoneCall,
  CheckCircle2,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { CrmOverview, OrganizerTask } from '../../lib/api.ts';

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
  const [taskFilter, setTaskFilter] = useState<'overdue' | 'today' | 'noDeadline'>('overdue');
  const [participantTab, setParticipantTab] = useState<'unanswered' | 'unconfirmed' | 'waitlist'>('unanswered');

  if (!overview) {
    return (
      <div className="py-20 text-center text-slate-500 text-xs font-mono">
        Загрузка пульса CRM...
      </div>
    );
  }

  const { nextEvening, actionLists, summary } = overview;

  const formatTableType = (format?: string) => {
    switch (format) {
      case 'NOVICE':
        return 'Стол для новичков';
      case 'TOURNAMENT':
        return 'Турнирный стол';
      case 'STANDARD':
      default:
        return 'Обычный стол';
    }
  };

  const formatPriority = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'Высокий';
      case 'low':
        return 'Низкий';
      case 'medium':
      default:
        return 'Обычный';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-wider">
            Главный экран организатора
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Сводка клуба и системные показатели в реальном времени
          </p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-bold cursor-pointer transition-all"
            title="Обновить данные"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Обновить</span>
          </button>
        )}
      </div>

      {/* Top Banner & Quick Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div
          onClick={() => onNavigateTab('tasks')}
          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 space-y-1 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Просрочено задач</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">
            {summary?.overdueTasksCount || 0}
          </div>
          <p className="text-[11px] text-slate-400">требуют срочного внимания</p>
        </div>

        <div
          onClick={() => onNavigateTab('tasks')}
          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 space-y-1 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Задачи на сегодня</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {summary?.todayTasksCount || 0}
          </div>
          <p className="text-[11px] text-slate-400">
            без срока: {summary?.noDeadlineTasksCount || 0}
          </p>
        </div>

        <div
          onClick={() => onNavigateTab('players')}
          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 space-y-1 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Новички / Пауза</span>
            <UserPlus className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {summary?.newcomersWithoutFollowupCount || 0}
          </div>
          <p className="text-[11px] text-slate-400">
            30+ дн. без визита: {summary?.lapsedPlayersCount || 0}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Неоплаченные суммы</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {summary?.totalUnpaidAmount || 0} ₽
          </div>
          <p className="text-[11px] text-slate-400">
            {summary?.unpaidParticipantsCount || 0} участников с долгом
          </p>
        </div>
      </div>

      {/* Main Grid: Nearest Evening + Urgent Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Nearest Evening Widget */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-rose-500" />
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                Ближайший Вечер
              </h3>
            </div>
            {nextEvening && (
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                  nextEvening.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}
              >
                {nextEvening.status === 'active' ? 'Идёт сейчас' : 'Запланирован'}
              </span>
            )}
          </div>

          {nextEvening ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-lg font-black text-white">{nextEvening.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  📅{' '}
                  {new Date(nextEvening.starts_at).toLocaleString('ru-RU', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                  {nextEvening.venue && ` • 📍 ${nextEvening.venue}`}
                </p>
              </div>

              {/* Attendance & Registration Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block font-sans">
                    Приглашены
                  </span>
                  <span className="text-sm font-bold text-amber-400">
                    {nextEvening.invitedCount || 0}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block font-sans">
                    Записаны
                  </span>
                  <span className="text-sm font-bold text-sky-400">
                    {nextEvening.registeredCount || 0}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block font-sans">
                    Подтверждено
                  </span>
                  <span className="text-sm font-bold text-emerald-400">
                    {nextEvening.confirmedCount || 0}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block font-sans">
                    Резерв
                  </span>
                  <span className="text-sm font-bold text-rose-400">
                    {nextEvening.waitlistCount || 0}
                  </span>
                </div>
              </div>

              {/* Table details & free spots */}
              {nextEvening.tables && nextEvening.tables.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-slate-800/80">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-rose-400" /> Столы и свободные места
                  </h5>
                  <div className="grid grid-cols-1 gap-2">
                    {nextEvening.tables.map((t) => (
                      <div
                        key={t.id}
                        className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-between text-xs gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          <span className="font-bold text-white">{t.name}</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            ({formatTableType(t.format)})
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[11px]">
                          <span>
                            Занято:{' '}
                            <strong className="text-white">
                              {t.occupied ?? (t.participant_count || 0)} / {t.capacity}
                            </strong>
                          </span>
                          <span>
                            Свободно:{' '}
                            <strong className="text-emerald-400">
                              {t.free_spots ?? Math.max(0, t.capacity - (t.occupied || 0))}
                            </strong>
                          </span>
                          {t.invited_count ? (
                            <span className="text-amber-400">Приглашены: {t.invited_count}</span>
                          ) : null}
                          {t.waitlist_count ? (
                            <span className="text-rose-400">Резерв: {t.waitlist_count}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Expected payment for nearest evening */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  Ожидается к оплате
                </span>
                <span className="font-mono font-bold text-amber-400">
                  {nextEvening.expectedToPayAmount || 0} ₽{' '}
                  <span className="text-[11px] text-slate-400 font-sans font-normal">
                    ({nextEvening.expectedToPayCount || 0} чел.)
                  </span>
                </span>
              </div>

              <button
                onClick={() => onOpenEvening(nextEvening.id)}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
              >
                <span>Открыть вечер</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-xs space-y-3">
              <p>Будущих запланированных вечеров пока нет.</p>
              <button
                onClick={() => onNavigateTab('evenings')}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Перейти к вечерам
              </button>
            </div>
          )}
        </div>

        {/* Organizer Tasks Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  Задачи Организатора
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab('tasks')}
                className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>Открыть раздел задач</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Task Category Tabs */}
            <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-bold">
              <button
                onClick={() => setTaskFilter('overdue')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  taskFilter === 'overdue'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Просрочено ({actionLists?.overdueTasks?.length || 0})
              </button>
              <button
                onClick={() => setTaskFilter('today')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  taskFilter === 'today'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Сегодня ({actionLists?.todayTasks?.length || 0})
              </button>
              <button
                onClick={() => setTaskFilter('noDeadline')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  taskFilter === 'noDeadline'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Без срока ({actionLists?.noDeadlineTasks?.length || 0})
              </button>
            </div>

            {/* Task List */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {(() => {
                const currentTasks =
                  taskFilter === 'overdue'
                    ? actionLists?.overdueTasks
                    : taskFilter === 'today'
                    ? actionLists?.todayTasks
                    : actionLists?.noDeadlineTasks;

                if (!currentTasks || currentTasks.length === 0) {
                  return (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      Задач в данной категории нет 🎉
                    </div>
                  );
                }

                return currentTasks.map((t: OrganizerTask) => (
                  <div
                    key={t.id}
                    className="p-3 bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-xl flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <span className="font-bold text-white block truncate">{t.title}</span>
                      {t.player_nickname && (
                        <button
                          onClick={() => t.player_id && onOpenPlayer(t.player_id)}
                          className="text-[11px] text-rose-400 hover:underline font-medium block cursor-pointer text-left"
                        >
                          👤 {t.player_nickname}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          t.priority === 'high'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {formatPriority(t.priority)}
                      </span>
                      {onCompleteTask && (
                        <button
                          onClick={() => onCompleteTask(t.id)}
                          className="p-1.5 bg-slate-900 border border-slate-700 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 rounded-lg cursor-pointer transition-all"
                          title="Отметить выполненной"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Switchable Action Lists for Nearest Evening */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Списки действий по ближайшему вечеру
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Участники и статус записи на следующий игровой вечер
            </p>
          </div>
          <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              onClick={() => setParticipantTab('unanswered')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                participantTab === 'unanswered'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Не ответили ({actionLists?.unansweredInvites?.length || 0})
            </button>
            <button
              onClick={() => setParticipantTab('unconfirmed')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                participantTab === 'unconfirmed'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Записаны, не подтвердили ({actionLists?.unconfirmedRegistered?.length || 0})
            </button>
            <button
              onClick={() => setParticipantTab('waitlist')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                participantTab === 'waitlist'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Резерв ({actionLists?.waitlistParticipants?.length || 0})
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {(() => {
            const list =
              participantTab === 'unanswered'
                ? actionLists?.unansweredInvites
                : participantTab === 'unconfirmed'
                ? actionLists?.unconfirmedRegistered
                : actionLists?.waitlistParticipants;

            if (!list || list.length === 0) {
              return (
                <div className="text-center py-8 text-slate-500 text-xs">
                  В данном списке пока нет участников 🙌
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((p: any) => {
                  const statusLabel =
                    p.registration_status === 'invited'
                      ? 'Приглашён'
                      : p.registration_status === 'registered'
                      ? 'Записан'
                      : p.registration_status === 'waitlist'
                      ? 'Резерв'
                      : p.registration_status;

                  const statusColor =
                    p.registration_status === 'invited'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : p.registration_status === 'registered'
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/30';

                  const tgUsername = p.telegram_username
                    ? p.telegram_username.startsWith('@')
                      ? p.telegram_username
                      : `@${p.telegram_username}`
                    : '—';

                  return (
                    <div
                      key={p.id}
                      className="p-3.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl space-y-2.5 text-xs transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white text-sm truncate">{p.nickname}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>

                      <div className="space-y-1 text-slate-400 text-[11px]">
                        <div>
                          Telegram: <span className="font-mono text-slate-200">{tgUsername}</span>
                        </div>
                        <div>
                          Стол: <span className="font-bold text-slate-200">{p.table_name || 'Без стола'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-slate-900">
                        <button
                          onClick={() => onOpenPlayer(p.player_id)}
                          className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-[11px] font-bold cursor-pointer transition-all text-center"
                        >
                          Игрок
                        </button>
                        <button
                          onClick={() => onOpenEvening(p.evening_id || nextEvening?.id || '')}
                          className="flex-1 py-1.5 px-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 hover:text-rose-200 rounded-xl text-[11px] font-bold cursor-pointer transition-all text-center"
                        >
                          Вечер
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Action Lists: Newcomers, Long-absent, Unpaid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Newcomers after 1st visit */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Новички (после 1-го визита)
              </h4>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {actionLists?.newcomersAfterFirst?.length || 0}
            </span>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {actionLists?.newcomersAfterFirst && actionLists.newcomersAfterFirst.length > 0 ? (
              actionLists.newcomersAfterFirst.map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => onOpenPlayer(p.id)}
                  className="p-2.5 bg-slate-950 border border-slate-800/80 hover:border-emerald-500/40 rounded-xl flex items-center justify-between gap-2 text-xs cursor-pointer transition-all"
                >
                  <div>
                    <span className="font-bold text-white block">{p.nickname}</span>
                    <span className="text-[10px] text-slate-400">
                      Визитов: {p.attendance_count || 1}
                    </span>
                  </div>
                  <button className="px-2.5 py-1 bg-slate-900 border border-slate-750 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold">
                    Карточка игрока
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs">
                Новичков без фидбека нет
              </div>
            )}
          </div>
        </div>

        {/* Absent 30+ Days */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-rose-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Отсутствуют 30+ дней
              </h4>
            </div>
            <span className="text-xs font-mono font-bold text-rose-400">
              {actionLists?.lapsedPlayers?.length || 0}
            </span>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {actionLists?.lapsedPlayers && actionLists.lapsedPlayers.length > 0 ? (
              actionLists.lapsedPlayers.map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => onOpenPlayer(p.id)}
                  className="p-2.5 bg-slate-950 border border-slate-800/80 hover:border-rose-500/40 rounded-xl flex items-center justify-between gap-2 text-xs cursor-pointer transition-all"
                >
                  <div>
                    <span className="font-bold text-white block">{p.nickname}</span>
                    <span className="text-[10px] text-rose-400 font-bold">
                      {p.last_visit ? `Последний визит: ${new Date(p.last_visit).toLocaleDateString('ru-RU')}` : 'Давно не был'}
                    </span>
                  </div>
                  <button className="px-2.5 py-1 bg-slate-900 border border-slate-750 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold">
                    Карточка игрока
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs">
                Нет отсутствующих более 30 дней
              </div>
            )}
          </div>
        </div>

        {/* Unpaid Amounts */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Неоплаченные суммы
              </h4>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {summary?.totalUnpaidAmount || 0} ₽
            </span>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {actionLists?.unpaidParticipants && actionLists.unpaidParticipants.length > 0 ? (
              actionLists.unpaidParticipants.map((p: any) => (
                <div
                  key={p.id}
                  className="p-2.5 bg-slate-950 border border-slate-800/80 rounded-xl flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <button
                      onClick={() => onOpenPlayer(p.player_id)}
                      className="font-bold text-white hover:underline text-left block truncate cursor-pointer"
                    >
                      {p.nickname}
                    </button>
                    <span className="text-[10px] text-slate-400 block truncate">
                      {p.evening_title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-rose-400">
                      {p.amount_due - p.amount_paid} ₽
                    </span>
                    <button
                      onClick={() => onOpenEvening(p.evening_id)}
                      className="px-2 py-1 bg-slate-900 border border-slate-750 text-rose-300 hover:text-white rounded-lg text-[10px] font-bold cursor-pointer"
                    >
                      Вечер
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs">
                Должников не обнаружено
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
