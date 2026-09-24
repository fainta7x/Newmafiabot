import React, { useEffect, useState } from 'react';
import { Gavel } from 'lucide-react';

type StaffRow = { player_id: string; nickname: string; evenings: number; games: number };

/** Who ran evenings and judged games in the selected period. */
export const StaffReportPanel: React.FC<{ period: string }> = ({ period }) => {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setError('');
    void fetch(`/api/analytics/staff?period=${encodeURIComponent(period)}`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить отчёт');
        if (!cancelled) setRows(Array.isArray(body.staff) ? body.staff : []);
      })
      .catch((loadError) => { if (!cancelled) setError(loadError?.message || 'Не удалось загрузить отчёт'); });
    return () => { cancelled = true; };
  }, [period]);

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5" data-testid="staff-report">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-accent/10 text-accent"><Gavel className="h-4 w-4" /></span>
        <div><h3 className="text-[14px] font-bold text-text-primary">Организаторы и судьи</h3><p className="text-[12px] text-text-muted">Проведённые вечера и отсуженные игры за период</p></div>
      </div>
      {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
      {rows && !rows.length ? <p className="mt-3 text-[13px] text-text-muted">За этот период вечеров с организатором и игр с судьёй из клуба нет.</p> : null}
      {rows?.length ? (
        <div className="mt-3 space-y-1.5">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2 text-[11px] font-semibold text-text-muted"><span>Игрок</span><span className="w-16 text-right">Вечеров</span><span className="w-16 text-right">Игр</span></div>
          {rows.map((row) => (
            <div key={row.player_id} className="grid min-h-11 grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[12px] bg-surface-2 px-2.5">
              <span className="truncate text-[14px] font-semibold text-text-primary">{row.nickname}</span>
              <span className="w-16 text-right text-[14px] tabular-nums text-text-primary">{row.evenings}</span>
              <span className="w-16 text-right text-[14px] tabular-nums text-text-primary">{row.games}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default StaffReportPanel;
