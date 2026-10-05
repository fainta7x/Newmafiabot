import { AnalyticsHeading, AnalyticsStatus, analyticsCard, useAnalyticsQuery } from './analyticsShared.tsx';
type StaffRow = { player_id:string; nickname:string; evenings:number; games:number };
export function StaffReportPanel({ period,active=true }: { period:string; active?:boolean }) {
  const query=useAnalyticsQuery<{ staff:StaffRow[]; label:string }>('/api/analytics/staff?period='+encodeURIComponent(period),active);
  return <section className={analyticsCard} data-testid="staff-report">
    <AnalyticsHeading title="Организаторы и судьи" help="staff" caption={'За период'+(query.data?' · '+query.data.label:'')} /><AnalyticsStatus {...query} />
    {query.data?.staff.length===0 && <p className="mt-3 text-xs text-text-secondary">За этот период вечеров с организатором и игр с судьёй из клуба нет.</p>}
    {!!query.data?.staff.length && <details className="mt-3" open><summary className="flex min-h-11 cursor-pointer items-center text-sm">Подробнее · {query.data.staff.length} человек</summary>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 px-2 text-xs text-text-secondary"><span>Игрок</span><span className="w-16 text-right">Вечеров</span><span className="w-12 text-right">Игр</span></div>
      {query.data.staff.map(row=><div key={row.player_id} className="mt-2 grid min-h-11 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm"><span className="min-w-0 break-words">{row.nickname}</span><span className="w-16 text-right">{row.evenings}</span><span className="w-12 text-right">{row.games}</span></div>)}
    </details>}
  </section>;
}
export default StaffReportPanel;
