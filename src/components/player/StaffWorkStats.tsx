type Breakdown = { total: number; by_format: Array<{ format: string; label: string; count: number }> };
import { russianPlural } from '../../lib/russianPlural.ts';
export type StaffWorkStatsData = { judged: Breakdown | null; organized: Breakdown | null } | null | undefined;


/**
 * Judging and organizing on a profile. The server sends `judged` only for players who judged and
 * `organized` only for organizers, so ordinary players see nothing here.
 */
export default function StaffWorkStats({ stats, variant = 'player', testId }: { stats: StaffWorkStatsData; variant?: 'player' | 'crm'; testId?: string }) {
  const rows = [
    stats?.judged ? { icon: '⚖️', title: `Отсудил ${stats.judged.total} ${russianPlural(stats.judged.total, 'игру', 'игры', 'игр')}`, data: stats.judged } : null,
    stats?.organized ? { icon: '🎩', title: `Провёл ${stats.organized.total} ${russianPlural(stats.organized.total, 'вечер', 'вечера', 'вечеров')}`, data: stats.organized } : null,
  ].filter(Boolean) as Array<{ icon: string; title: string; data: Breakdown }>;
  if (!rows.length) return null;

  const crm = variant === 'crm';
  return (
    <section data-testid={testId} className={crm ? 'space-y-1.5 rounded-[17px] border border-border-soft bg-surface-1 p-2.5' : 'space-y-2 rounded-[22px] border border-white/10 bg-white/[0.03] p-3'}>
      {!crm&&<h2 className="px-1 text-sm font-semibold text-white/80">Участие в работе клуба</h2>}
      {rows.map((row) => (
        <div key={row.icon} className={crm ? 'rounded-[12px] bg-surface-2 px-3 py-2' : 'rounded-2xl bg-white/[0.04] px-3 py-2'}>
          <div className={crm ? 'text-[14px] font-bold text-text-primary' : 'text-[14px] font-semibold text-white'}>{row.icon} {row.title}</div>
          {row.data.by_format.length ? (
            <div className={crm ? 'mt-0.5 text-[12px] text-text-secondary' : 'mt-0.5 text-[12px] text-white/55'}>
              {row.data.by_format.map((item) => `${item.label} ${item.count}`).join(' · ')}
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
