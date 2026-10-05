import { useEffect, useState } from 'react';
import { parseAnalyticsPeriod, type AnalyticsRange } from '../../lib/analyticsPeriod.ts';
import { analyticsSummary, formatShare } from '../../lib/analyticsFormat.ts';
import type { loadClubOverview, loadClubFinance, loadClubNow } from '../../server/services/clubAnalyticsService.ts';
import { useClubOwner } from './useClubOwner.ts';
import { AnalyticsHeading, AnalyticsHelp, AnalyticsStatus, analyticsCard, analyticsInset, useAnalyticsQuery } from './analyticsShared.tsx';
import { GameStatsPanel } from './GameStatsPanel.tsx';
import { StaffReportPanel } from './StaffReportPanel.tsx';
import { AppUsagePanel } from './AppUsagePanel.tsx';
import { OnlineNowPanel } from './OnlineNowPanel.tsx';

type Tab = 'club' | 'now' | 'finance' | 'games';
const tabs: Array<[Tab,string]> = [['now','Сейчас'],['club','Клуб'],['finance','Деньги'],['games','Игры и люди']];
const presets = [['7d','7 дней'],['30d','30 дней'],['90d','90 дней'],['season','Сезон'],['all','Всё время']];
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value: unknown) => number(value).toLocaleString('ru-RU') + ' ₽';
function savedTab(): Tab {
  try { const value = sessionStorage.getItem('club-analytics-tab'); if (tabs.some(([id])=>id===value)) return value as Tab; } catch { /* storage may be disabled in WebViews */ }
  return 'club';
}
const subtitle = (range: AnalyticsRange) => {
  if (range.id==='all' || range.label.includes('не задан')) return range.label;
  const date = (iso:string) => new Date(iso).toLocaleDateString('ru-RU',{ day:'numeric',month:'long',timeZone:'Europe/Moscow' });
  return range.label + ' · с ' + date(range.since) + ' по ' + date(new Date(Date.parse(range.until)-1).toISOString());
};
function Metric({ label, value, help, basis='за период' }: { label:string; value:string; help:Parameters<typeof AnalyticsHelp>[0]['name']; basis?:string }) {
  return <div className={analyticsInset}><div className="flex items-start justify-between gap-1"><span className="pt-2 text-xs text-text-secondary">{label}</span><AnalyticsHelp name={help} title={label} /></div><strong className="block text-2xl font-semibold tabular-nums">{value}</strong><p className="mt-1 text-xs text-text-muted">{basis}</p></div>;
}
export function AnalyticsCRM() {
  const owner = useClubOwner() === true;
  const [tab,setTab] = useState<Tab>(savedTab);
  const [period,setPeriod] = useState('30d');
  const overview = useAnalyticsQuery<Awaited<ReturnType<typeof loadClubOverview>>>('/api/analytics/overview?period='+period);
  const finance = useAnalyticsQuery<Awaited<ReturnType<typeof loadClubFinance>>>('/api/analytics/finance?period='+period,owner && tab==='finance');
  const now = useAnalyticsQuery<Awaited<ReturnType<typeof loadClubNow>>>('/api/analytics/now',tab==='now');
  const effectiveTab = tab==='finance' && !owner ? 'club' : tab;
  useEffect(()=>{ try { sessionStorage.setItem('club-analytics-tab',effectiveTab); } catch { /* optional memory */ } },[effectiveTab]);
  const data = overview.data;
  const range = data?.range || parseAnalyticsPeriod(period);
  const funnel = data?.communicationFunnel;
  return <div className="mx-auto max-w-5xl space-y-4 pb-4" data-testid="crm-analytics">
    <header><h2 className="text-2xl font-semibold">Аналитика клуба</h2><p className="mt-1 text-xs text-text-secondary">{subtitle(range)}{range.id!==period?' · обновляем выбранный период':''}</p></header>
    <div data-testid="analytics-controls" className="sticky top-[var(--app-content-top,60px)] z-10 space-y-2 rounded-2xl border border-border-soft bg-app-bg/95 p-2 backdrop-blur-xl">
      <label className="flex items-center gap-3 text-xs"><span className="shrink-0 text-text-secondary">Период</span><select aria-label="Период аналитики" value={period} onChange={event=>setPeriod(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-sm">
        {presets.map(([id,label])=><option key={id} value={id}>{label}</option>)}
        {(effectiveTab==='games' || period==='month' || period==='prev_month') && <><option value="month">Этот месяц</option><option value="prev_month">Прошлый месяц</option></>}
      </select></label>
      <div role="tablist" aria-label="Раздел аналитики" className={'grid gap-1 md:flex '+(owner?'grid-cols-4':'grid-cols-3')}>
        {tabs.filter(([id])=>id!=='finance' || owner).map(([id,label])=><button id={'analytics-tab-'+id} key={id} role="tab" type="button" aria-selected={effectiveTab===id} aria-controls={'analytics-panel-'+id} onClick={()=>setTab(id)} className={'min-h-11 rounded-xl px-2 text-xs font-semibold md:flex-1 '+(effectiveTab===id?'bg-white text-black':'bg-surface-2 text-text-secondary')}>{label}</button>)}
      </div>
    </div>
    <div id="analytics-panel-club" role="tabpanel" aria-labelledby="analytics-tab-club" hidden={effectiveTab!=='club'} className="space-y-4">
      <section className={analyticsCard}><AnalyticsHeading title="Как дела у клуба" caption={range.label+' · визиты участников клуба'} help="visits" />
        <AnalyticsStatus {...overview} />
        {data && <><p className="mt-3 text-sm leading-relaxed">{analyticsSummary(data,range.label)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="Новые игроки" value={String(number(data.newPlayers))} help="newPlayers" />
            <Metric label="Активные игроки" value={String(number(data.activePlayers))} help="activePlayers" />
            <Metric label="Визиты" value={String(number(data.totalAttended))} help="visits" />
            <Metric label="Заполняемость" value={data.fillRate===null?'—':formatShare(data.fillRate,1)} help="fill" basis={data.fillEvenings+' вечеров · без слотов: '+data.fillSkipped} />
          </div>{data.completedEvenings===0 && <p className="mt-3 text-xs text-text-secondary">За этот период завершённых вечеров не было.</p>}</>}
      </section>
      {data && <>
        <section className={analyticsCard}><AnalyticsHeading title="Новички возвращаются" help="retention" caption="Первый визит за период · наблюдаем 30 дней" />
          <strong className="mt-3 block text-2xl font-semibold">{data.cohortFirstVisits>=5?formatShare(data.cohortReturnedIn30Days,data.cohortFirstVisits):data.cohortReturnedIn30Days+' из '+data.cohortFirstVisits}</strong>
          <p className="mt-2 text-xs text-text-secondary">{data.cohortReturnedIn30Days} из {data.cohortFirstVisits} вернулись{data.cohortFirstVisits<5?' · мало данных':''}. Ещё считается: {data.cohortPending}.</p>
        </section>
        <section className={analyticsCard}><AnalyticsHeading title="Кто давно не был" caption="На сегодня · группы не пересекаются" help="inactive" />
          <div className="mt-3 grid grid-cols-3 gap-2">{[['30–59 дней',data.inactive30],['60–89 дней',data.inactive60],['90+ дней',data.inactive90]].map(([label,value])=><div key={String(label)} className={analyticsInset}><strong className="block text-2xl font-semibold">{value}</strong><span className="text-xs text-text-secondary">{label}</span></div>)}</div>
        </section>
        <section className={analyticsCard}><AnalyticsHeading title="Откуда новые игроки" caption="Первый визит за период · только участники клуба" help="sources" />
          {Object.keys(data.sourceBreakdown).length===0?<p className="mt-3 text-xs text-text-secondary">В этом периоде первых визитов пока нет.</p>:<div className="mt-3 space-y-2">{Object.entries(data.sourceBreakdown).map(([label,count])=><div key={label} className={'flex items-center justify-between gap-3 '+analyticsInset}><span className="min-w-0 break-words text-sm">{label}</span><strong className="shrink-0">{String(count)}</strong></div>)}</div>}
        </section>
        <details className={analyticsCard}><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Подробнее о базе и записях</summary>
          <AnalyticsHeading title="Участники клуба" caption="На сегодня · посещения за всё время" help="members" />
          <p className="my-3 text-sm">Всего: {data.totalPlayers}. Ещё не были: {data.neverPlayed}; один вечер: {data.playedOnce}; 2–3: {data.playedTwoOrThree}; 4+: {data.playedFourPlus}.</p>
          <AnalyticsHeading title="Уровни и допуски" caption="На сегодня · не зависят от выбранного периода" help="levels" />
          <p className="my-3 text-sm">Новички: {data.noviceLevel}. Допущены в клуб: {data.clubApproved}; к турнирам: {data.tournamentApproved}.</p>
          <AnalyticsHeading title="Записи, отмены и неявки" caption="Завершённые вечера периода · фактические записи" help="registrations" />
          <p className="mt-3 text-sm">Записей: {data.totalRegistrations}. Отмены: {data.totalCancelled} · {formatShare(data.totalCancelled,data.registrationBase)}. Неявки: {data.totalNoShow} · {formatShare(data.totalNoShow,data.totalRegistrations)}.</p>
        </details>
      </>}
    </div>
    <div id="analytics-panel-now" role="tabpanel" aria-labelledby="analytics-tab-now" hidden={effectiveTab!=='now'} className="space-y-4">
      <section className={analyticsCard}><AnalyticsHeading title="Сегодня и ближайший вечер" caption="На сегодня · время Москвы" help="now" /><AnalyticsStatus {...now} />
        {now.data && <><div className="mt-3 space-y-2">{now.data.today.map(evening=><a key={evening.id} href={'/admin/evenings/'+evening.id} className={'block min-h-11 text-sm '+analyticsInset}>{evening.title} · {new Date(evening.starts_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'})}</a>)}</div>
          {!now.data.today.length && <p className="mt-3 text-xs text-text-secondary">Сегодня вечеров нет.</p>}
          {now.data.next && <a className="mt-3 block min-h-11 rounded-xl bg-surface-2 p-3 text-sm" href={'/admin/evenings/'+now.data.next.id}>Ближайший: {now.data.next.title} · {new Date(now.data.next.starts_at).toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'Europe/Moscow'})}</a>}
          {owner && <p className="mt-3 text-sm">Неоплаченных записей: {now.data.openDebtCount}</p>}
        </>}
      </section>
      {owner && <OnlineNowPanel active={effectiveTab==='now'} />}
    </div>
    {owner && <div id="analytics-panel-finance" role="tabpanel" aria-labelledby="analytics-tab-finance" hidden={effectiveTab!=='finance'} className="space-y-4">
      <section className={analyticsCard}><AnalyticsHeading title="Деньги по вечерам периода" help="finance" caption="Основа — дата начала завершённого или рассчитанного вечера" /><AnalyticsStatus {...finance} />
        {finance.data && <><div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Начислено" value={money(finance.data.accrued)} help="finance" /><Metric label="Оплачено" value={money(finance.data.incomePaid)} help="finance" />
          <Metric label="Остаток долга" value={money(finance.data.outstandingDebt)} help="finance" /><Metric label="В среднем за вечер" value={money(finance.data.avgRevenuePerEvening)} help="finance" />
        </div><div className="mt-4 border-t border-border-soft pt-3"><AnalyticsHeading title="Поступило в период" help="receipts" caption="Отдельно: по дате платежа, включая старые вечера" /><strong className="text-2xl font-semibold">{money(finance.data.receivedInPeriod)}</strong></div>
          <details className="mt-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Подробнее по вечерам · {finance.data.eveningCount}</summary>
            {finance.data.evenings.length===0 && <p className="text-xs text-text-secondary">В этом периоде рассчитанных вечеров нет.</p>}
            <div className="space-y-2">{finance.data.evenings.map((evening:any)=><div key={evening.id} className={analyticsInset}><strong className="block text-sm">{evening.title}</strong><p className="mt-1 text-xs text-text-secondary">{new Date(evening.starts_at).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'})} · начислено {money(evening.accrued)} · оплачено {money(evening.incomePaid)} · долг {money(evening.outstandingDebt)}</p></div>)}</div>
            {finance.data.eveningsTruncated && <p className="mt-3 text-xs text-text-secondary">Показаны 200 последних вечеров; итоги выше включают весь период.</p>}
          </details></>}
      </section>
    </div>}
    <div id="analytics-panel-games" role="tabpanel" aria-labelledby="analytics-tab-games" hidden={effectiveTab!=='games'} className="space-y-4">
      <GameStatsPanel period={period} active={effectiveTab==='games'} />
      <StaffReportPanel period={period} active={effectiveTab==='games'} />
      <section className={analyticsCard}><AnalyticsHeading title="Личная рассылка → приход" help="funnel" caption="За период по дате вечера · доля от предыдущего шага" /><AnalyticsStatus {...overview} />
        {funnel && funnel.delivered === 0 && <p className="mt-3 text-sm text-text-secondary">За этот период личных приглашений не отправляли.</p>}
        {funnel && funnel.delivered > 0 && <div className="mt-3 space-y-3">{[['Доставлено',funnel.delivered,0],['Ответили',funnel.answered,funnel.delivered],['Идут',funnel.positive,funnel.answered],['Пришли',funnel.attended,funnel.positive]].map(([label,value,previous],index)=><div key={String(label)} className={analyticsInset}><div className="flex items-center justify-between gap-2 text-sm"><span>{label}</span><strong>{value} {index>0?'· '+formatShare(Number(value),Number(previous)):''}</strong></div>{index>0 && <div className="mt-2 h-1.5 rounded-full bg-surface-1"><div className="h-full rounded-full bg-accent" style={{width:Math.min(100,number(previous)>0?number(value)/number(previous)*100:0)+'%'}} /></div>}</div>)}</div>}
        {funnel && <p className="mt-3 text-xs text-text-secondary">Напоминаний: {funnel.reminded} · ошибок первой доставки: {funnel.failed}. При отсутствии приглашений воронка пустая.</p>}
      </section>
      <AppUsagePanel period={period} active={effectiveTab==='games'} />
    </div>
  </div>;
}
export default AnalyticsCRM;
