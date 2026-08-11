import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, CircleDollarSign, Send, TrendingUp, Users } from 'lucide-react';
import { api, type AnalyticsData } from '../../lib/api.ts';

type AnalyticsViewData = AnalyticsData & {
  playerJourney?: {
    neverPlayed: number;
    playedOnce: number;
    playedTwoOrThree: number;
    playedFourPlus: number;
    noviceLevel: number;
    clubApproved: number;
    tournamentApproved: number;
    readyForClubReview: number;
  };
  communicationFunnel?: {
    delivered: number;
    failed: number;
    answered: number;
    positive: number;
    attended: number;
    reminded: number;
    answerRate: number;
    positiveRate: number;
    attendanceRate: number;
  };
};

const card = 'rounded-[16px] border border-border-soft bg-surface-1 p-4';
const formatMoney = (value: number) => `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;

export const AnalyticsCRM: React.FC = () => {
  const [data, setData] = useState<AnalyticsViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>('all');

  useEffect(() => { void loadAnalytics(period); }, [period]);

  const loadAnalytics = async (selectedPeriod: string) => {
    setLoading(true);
    try {
      setData(await api.getAnalytics({ period: selectedPeriod }) as AnalyticsViewData);
    } catch (err: any) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) return <div className="p-12 text-center text-xs text-text-secondary">Загрузка аналитики клуба...</div>;

  const journey = data.playerJourney || { neverPlayed: 0, playedOnce: 0, playedTwoOrThree: 0, playedFourPlus: 0, noviceLevel: 0, clubApproved: 0, tournamentApproved: 0, readyForClubReview: 0 };
  const communication = data.communicationFunnel || { delivered: 0, failed: 0, answered: 0, positive: 0, attended: 0, reminded: 0, answerRate: 0, positiveRate: 0, attendanceRate: 0 };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className={`${card} flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}>
        <div>
          <h2 className="text-[20px] font-black tracking-tight text-text-primary">Аналитика клуба</h2>
          <p className="mt-1 text-[12px] text-text-secondary">Где теряются игроки, как работают приглашения и возвращаются ли новички.</p>
        </div>
        <div className="flex items-center gap-1 rounded-[12px] border border-border-soft bg-surface-2 p-1 text-xs">
          {['7d', '30d', '90d', 'all'].map((value) => <button key={value} onClick={() => setPeriod(value)} className={`min-h-9 rounded-[9px] px-3 font-bold transition-colors ${period === value ? 'bg-accent text-white' : 'text-text-secondary'}`}>{value === 'all' ? 'Всё' : value}</button>)}
        </div>
      </section>

      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-[15px] font-black text-text-primary">Путь игрока</h3><p className="mt-1 text-[11px] text-text-secondary">Текущее состояние всей базы. Допуск в основной клуб остаётся решением организатора.</p></div>
          <Users className="h-5 w-5 shrink-0 text-accent" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-[13px] bg-surface-2 p-3"><div className="text-[23px] font-black">{journey.neverPlayed}</div><div className="text-[10px] text-text-muted">ещё не были</div></div>
          <div className="rounded-[13px] bg-surface-2 p-3"><div className="text-[23px] font-black">{journey.playedOnce}</div><div className="text-[10px] text-text-muted">сыграли 1 вечер</div></div>
          <div className="rounded-[13px] bg-surface-2 p-3"><div className="text-[23px] font-black">{journey.playedTwoOrThree}</div><div className="text-[10px] text-text-muted">сыграли 2–3</div></div>
          <div className="rounded-[13px] bg-success-soft p-3"><div className="text-[23px] font-black text-success">{journey.playedFourPlus}</div><div className="text-[10px] text-text-muted">4+ посещений</div></div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-[13px] border border-border-soft px-3 py-3"><div className="text-[11px] text-text-muted">Уровень «новичок»</div><strong className="mt-1 block text-[18px]">{journey.noviceLevel}</strong></div>
          <div className="rounded-[13px] border border-border-soft px-3 py-3"><div className="text-[11px] text-text-muted">Допущены в основной клуб</div><strong className="mt-1 block text-[18px] text-success">{journey.clubApproved}</strong></div>
          <div className={`rounded-[13px] border px-3 py-3 ${journey.readyForClubReview ? 'border-warning/30 bg-warning-soft' : 'border-border-soft'}`}><div className="text-[11px] text-text-muted">Новички с 2+ визитами</div><strong className={`mt-1 block text-[18px] ${journey.readyForClubReview ? 'text-warning' : ''}`}>{journey.readyForClubReview}</strong><div className="mt-0.5 text-[9px] text-text-muted">Можно проверить, пора ли давать допуск</div></div>
        </div>
      </section>

      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-[15px] font-black text-text-primary">Личная рассылка → приход</h3><p className="mt-1 text-[11px] text-text-secondary">Воронка только по личным анонсам MafiaBot за выбранный период.</p></div>
          <Send className="h-5 w-5 shrink-0 text-accent" />
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-1">
          {[
            ['Доставлено', communication.delivered],
            ['Ответили', communication.answered],
            ['Идут', communication.positive],
            ['Пришли', communication.attended],
          ].map(([label, value], index) => <React.Fragment key={String(label)}><div className="rounded-[12px] bg-surface-2 p-2.5 text-center"><strong className="block text-[20px] text-text-primary">{value}</strong><span className="text-[9px] text-text-muted">{label}</span></div>{index < 3 ? <ArrowRight className="h-3.5 w-3.5 text-text-muted" /> : null}</React.Fragment>)}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[11px] bg-accent-soft p-2"><strong className="block text-[14px] text-accent">{communication.answerRate}%</strong><span className="text-[9px] text-text-muted">ответили</span></div>
          <div className="rounded-[11px] bg-accent-soft p-2"><strong className="block text-[14px] text-accent">{communication.positiveRate}%</strong><span className="text-[9px] text-text-muted">сказали «иду»</span></div>
          <div className="rounded-[11px] bg-accent-soft p-2"><strong className="block text-[14px] text-accent">{communication.attendanceRate}%</strong><span className="text-[9px] text-text-muted">реально пришли</span></div>
        </div>
        <p className="mt-3 text-[10px] text-text-muted">Напоминание получали: {communication.reminded} · ошибок первичной доставки: {communication.failed}. «Пришли» считается только по уже завершённым вечерам.</p>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <div className={card}><div className="flex items-center justify-between"><span className="text-[11px] font-bold text-text-secondary">Retention новичков 30д</span><TrendingUp className="h-4 w-4 text-success" /></div><div className="mt-2 text-[28px] font-black text-success">{data.cohortRetention30dRate}%</div><p className="mt-1 text-[10px] text-text-muted">{data.cohortReturnedIn30Days} из {data.cohortFirstVisits} первых визитов вернулись за 30 дней</p></div>
        <div className={card}><div className="flex items-center justify-between"><span className="text-[11px] font-bold text-text-secondary">Неактивные 30+ дней</span><AlertTriangle className="h-4 w-4 text-warning" /></div><div className="mt-2 text-[28px] font-black text-warning">{data.inactive30}</div><p className="mt-1 text-[10px] text-text-muted">60+ дней: {data.inactive60} · 90+ дней: {data.inactive90}</p></div>
        <div className={card}><div className="flex items-center justify-between"><span className="text-[11px] font-bold text-text-secondary">Игроков в базе</span><Users className="h-4 w-4 text-accent" /></div><div className="mt-2 text-[28px] font-black">{data.totalPlayers}</div><p className="mt-1 text-[10px] text-text-muted">Турнирный допуск: {journey.tournamentApproved}</p></div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className={card}>
          <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-accent" /><h3 className="text-[14px] font-black">Вечера за период</h3></div>
          <div className="mt-3 space-y-2 text-[11px]">
            <div className="flex justify-between rounded-[11px] bg-surface-2 p-3"><span className="text-text-secondary">Завершено</span><strong>{data.completedEvenings}</strong></div>
            <div className="flex justify-between rounded-[11px] bg-surface-2 p-3"><span className="text-text-secondary">Записей</span><strong>{data.totalRegistrations}</strong></div>
            <div className="flex justify-between rounded-[11px] bg-success-soft p-3"><span className="text-text-secondary">Пришли</span><strong className="text-success">{data.totalAttended}</strong></div>
            <div className="flex justify-between rounded-[11px] bg-surface-2 p-3"><span className="text-text-secondary">Отменили</span><strong>{data.totalCancelled} · {data.cancellationRate}%</strong></div>
            <div className="flex justify-between rounded-[11px] bg-danger-soft p-3"><span className="text-text-secondary">No-show</span><strong className="text-danger">{data.totalNoShow} · {data.noShowRate}%</strong></div>
          </div>
        </section>

        <section className={card}>
          <div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-success" /><h3 className="text-[14px] font-black">Финансы за период</h3></div>
          <div className="mt-3 space-y-2 text-[11px]">
            <div className="flex justify-between rounded-[11px] bg-surface-2 p-3"><span className="text-text-secondary">Начислено</span><strong>{formatMoney(data.financials.accrued)}</strong></div>
            <div className="flex justify-between rounded-[11px] bg-success-soft p-3"><span className="text-text-secondary">Оплачено</span><strong className="text-success">{formatMoney(data.financials.incomePaid)}</strong></div>
            <div className="flex justify-between rounded-[11px] bg-danger-soft p-3"><span className="text-text-secondary">Открытые долги</span><strong className="text-danger">{formatMoney(data.financials.outstandingDebt)}</strong></div>
            <div className="flex justify-between rounded-[11px] bg-surface-2 p-3"><span className="text-text-secondary">Средний доход / вечер</span><strong>{formatMoney(data.financials.avgRevenuePerEvening)}</strong></div>
          </div>
        </section>
      </div>

      <section className={card}>
        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /><h3 className="text-[14px] font-black">Откуда приходят игроки</h3></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(data.sourceBreakdown || {}).map(([src, count]) => <div key={src} className="rounded-[11px] bg-surface-2 p-3"><span className="block truncate text-[9px] font-bold uppercase text-text-muted">{src}</span><strong className="mt-1 block text-[16px]">{count} чел.</strong></div>)}
        </div>
      </section>
    </div>
  );
};

export default AnalyticsCRM;
