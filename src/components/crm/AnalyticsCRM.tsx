import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Users,
  AlertTriangle,
  Palette,
  Check,
} from 'lucide-react';
import { api, AnalyticsData } from '../../lib/api.ts';
import { THEMES, ThemeId, applyTheme, getStoredTheme } from '../../lib/theme.ts';

interface AnalyticsCRMProps {
  onOpenThemeModal?: () => void;
}

export const AnalyticsCRM: React.FC<AnalyticsCRMProps> = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>('all');
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('noir-cherry');

  useEffect(() => {
    setCurrentTheme(getStoredTheme());
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

  const handleSelectTheme = (id: ThemeId) => {
    applyTheme(id);
    setCurrentTheme(id);
  };

  if (loading || !data) {
    return <div className="p-12 text-center text-text-secondary text-xs">Загрузка аналитики клуба...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Settings Block: Interface Theme */}
      <div className="bg-surface-1 border border-border-soft rounded-[16px] p-5 space-y-4">
        <div className="flex items-center gap-3 border-b border-border-soft pb-3">
          <div className="w-10 h-10 rounded-[12px] bg-accent-soft border border-accent/30 flex items-center justify-center text-accent shrink-0">
            <Palette className="w-5 h-5 stroke-[1.8]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary">Тема интерфейса</h3>
            <p className="text-xs text-text-secondary">
              Выберите визуальный стиль CRM системы. Изменения применяются мгновенно и сохраняются.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {THEMES.map((t) => {
            const isActive = currentTheme === t.id;
            return (
              <div
                key={t.id}
                onClick={() => handleSelectTheme(t.id)}
                className={`p-3.5 rounded-[14px] border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isActive
                    ? 'bg-surface-2 border-accent shadow-md'
                    : 'bg-surface-1 hover:bg-surface-2 border-border-soft hover:border-border-strong'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-text-primary">{t.name}</span>
                    {isActive && (
                      <span className="w-4 h-4 rounded-full bg-accent text-text-primary flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-secondary leading-tight">{t.tagline}</p>
                </div>

                {/* Color preview swatches */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-border-soft">
                  <div
                    className="w-4 h-4 rounded-full border border-white/20"
                    style={{ backgroundColor: t.bgHex }}
                    title="Фон"
                  />
                  <div
                    className="w-4 h-4 rounded-full border border-white/20"
                    style={{ backgroundColor: t.surfaceHex }}
                    title="Поверхность"
                  />
                  <div
                    className="w-4 h-4 rounded-full border border-white/20"
                    style={{ backgroundColor: t.accentHex }}
                    title="Акцент"
                  />
                  <div
                    className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[8px] font-bold"
                    style={{ backgroundColor: t.surfaceHex, color: t.textHex }}
                    title="Текст"
                  >
                    Aa
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Banner with Period Selector */}
      <div className="bg-surface-1 border border-border-soft p-5 rounded-[16px] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary tracking-tight">Сквозная аналитика клуба</h2>
          <p className="text-xs text-text-secondary mt-0.5">Когортный Retention, начисления, долги и финансы по транзакциям</p>
        </div>
        <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-[12px] border border-border-soft text-xs">
          {['7d', '30d', '90d', 'all'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-[10px] font-semibold transition-colors cursor-pointer ${
                period === p ? 'bg-accent text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {p === 'all' ? 'Всё время' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Grid 1: Player Acquisition & Conversion */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-1 border border-border-soft rounded-[16px] p-5 space-y-2">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="text-xs font-semibold">Всего в базе</span>
            <Users className="w-4 h-4 text-accent" />
          </div>
          <div className="text-3xl font-bold text-text-primary">{data.totalPlayers}</div>
          <p className="text-xs text-text-secondary">Первых визитов в периоде: {data.cohortFirstVisits}</p>
        </div>

        <div className="bg-surface-1 border border-border-soft rounded-[16px] p-5 space-y-2">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="text-xs font-semibold">Когортный Retention 30д</span>
            <TrendingUp className="w-4 h-4 text-success" />
          </div>
          <div className="text-3xl font-bold text-success">{data.cohortRetention30dRate}%</div>
          <p className="text-xs text-text-secondary">
            {data.cohortReturnedIn30Days} из {data.cohortFirstVisits} новичков вернулись в течение 30 дней
          </p>
        </div>

        <div className="bg-surface-1 border border-border-soft rounded-[16px] p-5 space-y-2">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="text-xs font-semibold">Неактивные (Накопительно)</span>
            <AlertTriangle className="w-4 h-4 text-warning" />
          </div>
          <div className="text-3xl font-bold text-warning">
            {data.inactive30}
          </div>
          <p className="text-xs text-text-secondary">
            30+ дн: {data.inactive30} • 60+ дн: {data.inactive60} • 90+ дн: {data.inactive90}
          </p>
        </div>
      </div>

      {/* Grid 2: Attendance & Conversion Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Attendance conversion */}
        <div className="bg-surface-1 border border-border-soft rounded-[16px] p-5 space-y-4">
          <h3 className="text-sm font-bold text-text-primary">Записи и дисциплина (Завершённые вечера)</h3>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-[12px] border border-border-soft">
              <span className="text-text-secondary">Завершено вечеров:</span>
              <span className="font-semibold text-text-primary">{data.completedEvenings}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-[12px] border border-border-soft">
              <span className="text-text-secondary">Всего записей:</span>
              <span className="font-semibold text-text-primary">{data.totalRegistrations}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-[12px] border border-border-soft">
              <span className="text-text-secondary">Посещений (Attended):</span>
              <span className="font-semibold text-success">{data.totalAttended}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-[12px] border border-border-soft">
              <span className="text-text-secondary">Отмены записей:</span>
              <span className="font-semibold text-text-secondary">{data.totalCancelled} ({data.cancellationRate}%)</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-[12px] border border-border-soft">
              <span className="text-text-secondary">Пропуски (No-show):</span>
              <span className="font-semibold text-danger">{data.totalNoShow} ({data.noShowRate}%)</span>
            </div>
          </div>
        </div>

        {/* Financial Economy */}
        <div className="bg-surface-1 border border-border-soft rounded-[16px] p-5 space-y-4">
          <h3 className="text-sm font-bold text-text-primary">Финансы клуба (по транзакциям)</h3>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-[12px] border border-border-soft">
              <span className="text-text-secondary">Начислено (Accrued):</span>
              <span className="font-semibold text-text-primary">{data.financials.accrued} ₽</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-[12px] border border-border-soft">
              <span className="text-text-secondary">Оплачено (Income Paid):</span>
              <span className="font-semibold text-success">{data.financials.incomePaid} ₽</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-[12px] border border-border-soft">
              <span className="text-text-secondary">Открытые долги (Outstanding):</span>
              <span className="font-semibold text-danger">{data.financials.outstandingDebt} ₽</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-[12px] border border-border-soft">
              <span className="text-text-secondary">Средний доход за вечер:</span>
              <span className="font-semibold text-success">{data.financials.avgRevenuePerEvening} ₽</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sources Breakdown */}
      <div className="bg-surface-1 border border-border-soft rounded-[16px] p-5 space-y-4">
        <h3 className="text-sm font-bold text-text-primary">Источники прихода новых игроков</h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {Object.entries(data.sourceBreakdown || {}).map(([src, count]) => (
            <div key={src} className="p-3 bg-surface-2 border border-border-soft rounded-[12px] space-y-1">
              <span className="text-[10px] text-text-muted uppercase font-semibold block">{src}</span>
              <span className="text-base font-bold text-text-primary">{count} чел.</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
