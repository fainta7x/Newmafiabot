import React, { useEffect, useState } from 'react';
import { Gavel } from 'lucide-react';

type StaffRow = { player_id: string; nickname: string; evenings: number; games: number };

const PERIODS: Array<{ id: string; label: string }> = [
  { id: 'month', label: 'Этот месяц' },
  { id: 'prev_month', label: 'Прошлый месяц' },
  { id: 'season', label: 'Сезон' },
  { id: 'all', label: 'Всё время' },
];

/** Who ran evenings and judged games in a calendar month, the rating season or all time. */
export const StaffReportPanel: React.FC = () => {
  const [period, setPeriod] = useState('month');
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setError('');
    void fetch(`/api/analytics/staff?period=${encodeURIComponent(period)}`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить отчёт');
        if (!cancelled) { setRows(Array.isArray(body.staff) ? body.staff : []); setLabel(String(body.label || '')); }
      })
      .catch((loadError) => { if (!cancelled) setError(loadError?.message || 'Не удалось загрузить отчёт'); });
    return () => { cancelled = true; };
  }, [period]);

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5" data-testid="staff-report">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-accent/10 text-accent"><Gavel className="h-4 w-4" /></span>
        <div><h3 className="text-[14px] font-bold text-text-primary">Организаторы и судьи</h3><p className="text-[12px] text-text-muted">Проведённые вечера и отсуженные игры{label ? ` · ${label}` : ''}</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5" role="group" aria-label="Период отчёта">
        {PERIODS.map((option) => (
          <button key={option.id} type="button" aria-pressed={period === option.id} onClick={() => setPeriod(option.id)}
            className={`min-h-10 rounded-[10px] px-2 text-[13px] font-semibold ${period === option.id ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary'}`}>
            {option.label}
          </button>
        ))}
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
