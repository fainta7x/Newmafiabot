import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Users,
  DollarSign,
  UserCheck,
  UserX,
  AlertTriangle,
  BarChart3,
  PieChart,
  Calendar,
  Layers,
} from 'lucide-react';
import { api, AnalyticsData } from '../../lib/api.ts';

export const AnalyticsCRM: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await api.getAnalytics();
      setData(res);
    } catch (err: any) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return <div className="p-12 text-center text-slate-500 text-xs">Загрузка аналитики клуба...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl">
        <h2 className="text-xl font-black text-white uppercase tracking-tight">Сквозная Аналитика Клуба</h2>
        <p className="text-xs text-slate-400 mt-0.5">Удержание игроков (Retention 30/60/90), конверсии, No-show и экономика вечеров</p>
      </div>

      {/* Grid 1: Player Acquisition & Conversion */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Всего в базе</span>
            <Users className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-3xl font-black text-white font-mono">{data.totalPlayers}</div>
          <p className="text-xs text-slate-400">{data.newPlayersCount} новичков за всё время</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Конверсия 1-го во 2-й визит</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400 font-mono">{data.conversion1to2}%</div>
          <p className="text-xs text-slate-400">
            {data.multiVisitPlayers} из {data.oneVisitPlayers + data.multiVisitPlayers} игроков пришли 2+ раза
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Неактивные игроки</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-400 font-mono">
            {data.inactive30 + data.inactive60 + data.inactive90}
          </div>
          <p className="text-xs text-slate-400">
            30 дн: {data.inactive30} • 60 дн: {data.inactive60} • 90+ дн: {data.inactive90}
          </p>
        </div>
      </div>

      {/* Grid 2: Attendance & Conversion Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Attendance conversion */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Конверсия Записи и Явки</h3>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Всего записей на вечера:</span>
              <span className="font-bold text-white">{data.totalRegistrations}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Реально пришло:</span>
              <span className="font-bold text-emerald-400">{data.totalAttended}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Отменили запись:</span>
              <span className="font-bold text-slate-400">{data.totalCancelled} ({data.cancellationRate}%)</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Не пришли без предупреждения (No-show):</span>
              <span className="font-bold text-rose-400">{data.totalNoShow} ({data.noShowRate}%)</span>
            </div>
          </div>
        </div>

        {/* Financial Economy */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Экономика Мероприятий</h3>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Проведено вечеров:</span>
              <span className="font-bold text-white">{data.totalEvenings}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Средняя явка на вечер:</span>
              <span className="font-bold text-amber-400">{data.avgAttendance} чел.</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Общая выручка клуба:</span>
              <span className="font-bold text-emerald-400">{data.totalRevenue} ₽</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Средний чек за вечер:</span>
              <span className="font-bold text-emerald-400">{data.avgRevenue} ₽</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Текущий открытый долг:</span>
              <span className="font-bold text-rose-400">{data.totalOutstandingDebt} ₽</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sources Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Источники Прихода Новых Игроков</h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {Object.entries(data.sourceBreakdown || {}).map(([src, count]) => (
            <div key={src} className="p-3 bg-slate-950 border border-slate-850 rounded-2xl space-y-1 font-mono">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">{src}</span>
              <span className="text-lg font-bold text-white">{count} чел.</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
