import React from 'react';
import { Calendar, Users, AlertCircle, DollarSign, Clock, UserPlus, ArrowRight, PhoneCall } from 'lucide-react';
import { GameEvening, OrganizerTask, Player } from '../../lib/api.ts';

interface CRMOverviewProps {
  evenings: GameEvening[];
  tasks: OrganizerTask[];
  players: Player[];
  onOpenEvening: (id: string) => void;
  onOpenPlayer: (id: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const CRMOverview: React.FC<CRMOverviewProps> = ({
  evenings,
  tasks,
  players,
  onOpenEvening,
  onOpenPlayer,
  onNavigateTab,
}) => {
  // 1. Nearest evening
  const activeOrUpcoming = evenings
    .filter((e) => e.status !== 'completed' && e.status !== 'cancelled')
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const nearestEvening = activeOrUpcoming[0] || evenings[0];

  // 2. Tasks for today or overdue
  const todayTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');

  // 3. Newcomers who haven't returned (1 visit)
  const newcomers1Visit = players.filter((p) => p.attendance_count === 1);

  // 4. Inactive 30+ days
  const inactive30Plus = players.filter((p) => (p.days_since_last_visit || 0) >= 30);

  // 5. Unpaid debts total
  const totalUnpaidDebts = players.reduce((sum, p) => sum + (p.outstanding_debt || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Всего игроков</span>
            <Users className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{players.length}</div>
          <p className="text-[11px] text-slate-400">{newcomers1Visit.length} новичков (1 визит)</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Задачи на сегодня</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{todayTasks.length}</div>
          <p className="text-[11px] text-amber-400 font-bold">требуют внимания</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Отсутствуют 30+ дн.</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">{inactive30Plus.length}</div>
          <p className="text-[11px] text-slate-400">нужен повторный контакт</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Долги участников</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{totalUnpaidDebts} ₽</div>
          <p className="text-[11px] text-slate-400">неоплаченные суммы</p>
        </div>
      </div>

      {/* Main Grid: Nearest Evening + Urgent Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Nearest Evening Widget */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-rose-500" />
              <h3 className="text-base font-bold text-white uppercase tracking-wider">Ближайший Вечер</h3>
            </div>
            {nearestEvening && (
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                nearestEvening.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {nearestEvening.status === 'active' ? 'Идёт сейчас' : 'Запланирован'}
              </span>
            )}
          </div>

          {nearestEvening ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-lg font-black text-white">{nearestEvening.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  📅 {new Date(nearestEvening.starts_at).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}
                  {nearestEvening.venue && ` • 📍 ${nearestEvening.venue}`}
                </p>
              </div>

              {/* Progress Counters */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Записано</span>
                  <span className="text-lg font-bold text-white font-mono">{nearestEvening.registered_count || 0} / {nearestEvening.capacity}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Подтверждено</span>
                  <span className="text-lg font-bold text-emerald-400 font-mono">{nearestEvening.confirmed_count || 0}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Мест осталось</span>
                  <span className="text-lg font-bold text-amber-400 font-mono">{Math.max(0, nearestEvening.capacity - (nearestEvening.registered_count || 0))}</span>
                </div>
              </div>

              <button
                onClick={() => onOpenEvening(nearestEvening.id)}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
              >
                <span>Открыть управление вечером</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-xs">
              Нет запланированных вечеров.{' '}
              <button onClick={() => onNavigateTab('evenings')} className="text-rose-400 underline font-bold">Создать новый</button>
            </div>
          )}
        </div>

        {/* Tasks for Today */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white uppercase tracking-wider">Задачи на сегодня</h3>
            </div>
            <button
              onClick={() => onNavigateTab('tasks')}
              className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Все задачи</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {todayTasks.length > 0 ? (
              todayTasks.slice(0, 5).map((t) => (
                <div
                  key={t.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-white block truncate">{t.title}</span>
                    {t.player_nickname && (
                      <span className="text-[11px] text-rose-400 block font-medium">👤 {t.player_nickname}</span>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    t.priority === 'high' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {t.priority}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500 text-xs">Все текущие задачи выполнены 🎉</div>
            )}
          </div>
        </div>
      </div>

      {/* Retention Risk Widgets: Newcomers & Long-absent players */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Newcomers 1 visit */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Новички (были 1 раз, не вернулись)
              </h4>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">{newcomers1Visit.length}</span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {newcomers1Visit.slice(0, 6).map((p) => (
              <div
                key={p.id}
                onClick={() => onOpenPlayer(p.id)}
                className="p-2.5 bg-slate-950 border border-slate-800/80 hover:border-emerald-500/40 rounded-xl flex items-center justify-between gap-2 text-xs cursor-pointer transition-all"
              >
                <div>
                  <span className="font-bold text-white block">{p.nickname}</span>
                  <span className="text-[10px] text-slate-400">Первый визит: {p.first_visit ? new Date(p.first_visit).toLocaleDateString('ru-RU') : 'недавно'}</span>
                </div>
                <button className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[10px] font-bold border border-emerald-500/30 hover:bg-emerald-500/20">
                  Пригласить
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Absent 30+ Days */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-rose-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Отсутствуют более 30 дней
              </h4>
            </div>
            <span className="text-xs font-mono font-bold text-rose-400">{inactive30Plus.length}</span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {inactive30Plus.slice(0, 6).map((p) => (
              <div
                key={p.id}
                onClick={() => onOpenPlayer(p.id)}
                className="p-2.5 bg-slate-950 border border-slate-800/80 hover:border-rose-500/40 rounded-xl flex items-center justify-between gap-2 text-xs cursor-pointer transition-all"
              >
                <div>
                  <span className="font-bold text-white block">{p.nickname}</span>
                  <span className="text-[10px] text-rose-400 font-bold">{p.days_since_last_visit} дн. без визитов</span>
                </div>
                <button className="px-2 py-1 bg-rose-500/10 text-rose-400 rounded-lg text-[10px] font-bold border border-rose-500/30 hover:bg-rose-500/20">
                  Карточка
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
