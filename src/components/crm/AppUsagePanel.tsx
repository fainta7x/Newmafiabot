import React, { useState } from 'react';
import { AnalyticsHeading, AnalyticsStatus, analyticsCard, useAnalyticsQuery } from './analyticsShared.tsx';
import { type UiUsageRow, type UiUsageSummary } from '../../lib/api.ts';
import { SCREEN_LABELS, actionLabel } from '../../lib/screenLabels.ts';

// Screen names are shared with «Сейчас в приложении» (src/lib/screenLabels.ts).


const SURFACE_LABELS = { player: 'Игроки', crm: 'Организаторы', public: 'Публичные' } as const;

const screenLabel = (row: UiUsageRow) => SCREEN_LABELS[row.name] || row.name;



/** Which screens and buttons people actually use — anonymous, from uiTelemetry. */
export const AppUsagePanel: React.FC<{ period:string; active?:boolean }> = ({ period,active=true }) => {
  const query=useAnalyticsQuery<UiUsageSummary>('/api/ui-events/summary?period='+encodeURIComponent(period),active);
  const data=query.data;
  const [surface,setSurface]=useState<'player'|'crm'>('player');

  const screens = (data?.screens || []).filter((row) => row.surface === surface);
  const actions = (data?.actions || []).filter((row) => row.surface === surface);
  const maxPeople = Math.max(1, ...screens.map((row) => row.people));

  return (
    <section className={analyticsCard} data-testid="crm-app-usage">
      <AnalyticsHeading title="Как пользуются приложением" help="usage" caption="За период · история ограничена последними 180 днями · без имён" />
      <AnalyticsStatus {...query} />
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-[12px] border border-border-soft bg-surface-2 p-1 text-[13px]">
        {(['player', 'crm'] as const).map((value) => (
          <button key={value} type="button" onClick={() => setSurface(value)} className={`min-h-11 rounded-[9px] font-bold ${surface === value ? 'bg-accent text-white' : 'text-text-secondary'}`}>
            {SURFACE_LABELS[value]}{data ? ` · ${data.people[value]} чел.` : ''}
          </button>
        ))}
      </div>
      {data && !screens.length ? <p className="mt-3 rounded-[11px] bg-surface-2 p-3 text-[12px] text-text-secondary">Данных пока нет — они начнут появляться, когда {surface === 'player' ? 'игроки' : 'организаторы'} откроют приложение после обновления.</p> : null}
      {screens.length ? (
        <div className="mt-3 space-y-1.5">
          <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">Экраны · людей и заходов</div>
          {screens.slice(0, 15).map((row) => (
            <div key={row.name} className="relative overflow-hidden rounded-[10px] bg-surface-2 px-3 py-2">
              <div className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${Math.round((row.people / maxPeople) * 100)}%` }} />
              <div className="relative flex items-center justify-between gap-3 text-[12px]"><span className="min-w-0 truncate text-text-primary">{screenLabel(row)}</span><strong className="shrink-0">{row.people} чел. · {row.visits} заходов</strong></div>
            </div>
          ))}
        </div>
      ) : null}
      {actions.length ? (
        <div className="mt-4 space-y-1.5">
          <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">Нажатия · людей и заходов</div>
          {actions.slice(0, 15).map((row) => (
            <div key={row.name} className="flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2 text-[12px]"><span className="min-w-0 truncate text-text-primary">{actionLabel(row.name)}</span><strong className="shrink-0">{row.people} чел. · {row.visits} заходов</strong></div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default AppUsagePanel;
