import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { api, AnalyticsData } from '../../lib/api.ts';

export const AnalyticsCRM: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>('all');

  useEffect(() => {
    loadAnalytics(period);
  }, [period]);

  const loadAnalytics = async (selectedPeriod: string) => {
    setLoading(true);
    try {
      const res = await api.getAnalytics({ period: selectedPeriod });
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
      {/* Top Banner with Period Selector */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight">Сквозная Аналитика Клуба</h2>
          <p className="text-xs text-slate-400 mt-0.5">Когортный Retention, начисления, долги и финансы по транзакциям</p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs">
          {['7d', '30d', '90d', 'all'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-xl font-bold font-mono transition-colors ${
                period === p ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {p === 'all' ? 'Всё время' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Grid 1: Player Acquisition & Conversion */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Всего в базе</span>
            <Users className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-3xl font-black text-white font-mono">{data.totalPlayers}</div>
          <p className="text-xs text-slate-400">Первых визитов в периоде: {data.cohortFirstVisits}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Когортный Retention 30д</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400 font-mono">{data.cohortRetention30dRate}%</div>
          <p className="text-xs text-slate-400">
            {data.cohortReturnedIn30Days} из {data.cohortFirstVisits} новичков вернулись в течение 30 дней
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Неактивные (Накопительно)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-400 font-mono">
            {data.inactive30}
          </div>
          <p className="text-xs text-slate-400">
            30+ дн: {data.inactive30} • 60+ дн: {data.inactive60} • 90+ дн: {data.inactive90}
          </p>
        </div>
      </div>

      {/* Grid 2: Attendance & Conversion Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Attendance conversion */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Записи и Дисциплина (Завершённые вечера)</h3>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Завершено вечеров:</span>
              <span className="font-bold text-white">{data.completedEvenings}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Всего записей:</span>
              <span className="font-bold text-white">{data.totalRegistrations}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Посещений (Attended):</span>
              <span className="font-bold text-emerald-400">{data.totalAttended}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Отмены записей:</span>
              <span className="font-bold text-slate-400">{data.totalCancelled} ({data.cancellationRate}%)</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Пропуски (No-show):</span>
              <span className="font-bold text-rose-400">{data.totalNoShow} ({data.noShowRate}%)</span>
            </div>
          </div>
        </div>

        {/* Financial Economy */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Финансы Клуба (по Транзакциям)</h3>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Начислено (Accrued):</span>
              <span className="font-bold text-white">{data.financials.accrued} ₽</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Оплачено (Income Paid):</span>
              <span className="font-bold text-emerald-400">{data.financials.incomePaid} ₽</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Открытые долги (Outstanding):</span>
              <span className="font-bold text-rose-400">{data.financials.outstandingDebt} ₽</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-850">
              <span className="text-slate-400">Средний доход за вечер:</span>
              <span className="font-bold text-emerald-400">{data.financials.avgRevenuePerEvening} ₽</span>
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
