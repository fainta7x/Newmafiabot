type Breakdown = { total: number; by_format: Array<{ format: string; label: string; count: number }> };
export type StaffWorkStatsData = { judged: Breakdown | null; organized: Breakdown | null } | null | undefined;

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10; const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/**
 * Judging and organizing on a profile. The server sends `judged` only for players who judged and
 * `organized` only for organizers, so ordinary players see nothing here.
 */
export default function StaffWorkStats({ stats, variant = 'player', testId }: { stats: StaffWorkStatsData; variant?: 'player' | 'crm'; testId?: string }) {
  const rows = [
    stats?.judged ? { icon: '⚖️', title: `Отсудил ${stats.judged.total} ${plural(stats.judged.total, 'игру', 'игры', 'игр')}`, data: stats.judged } : null,
    stats?.organized ? { icon: '🎩', title: `Провёл ${stats.organized.total} ${plural(stats.organized.total, 'вечер', 'вечера', 'вечеров')}`, data: stats.organized } : null,
  ].filter(Boolean) as Array<{ icon: string; title: string; data: Breakdown }>;
  if (!rows.length) return null;

  const crm = variant === 'crm';
  return (
    <section data-testid={testId} className={crm ? 'space-y-1.5 rounded-[17px] border border-border-soft bg-surface-1 p-2.5' : 'space-y-2 rounded-[22px] border border-white/10 bg-white/[0.03] p-3'}>
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
