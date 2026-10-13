import React, { useMemo, useState } from 'react';
import { AnalyticsHeading, AnalyticsStatus, analyticsCard, useAnalyticsQuery } from './analyticsShared.tsx';
import { screenLabel as screenName } from '../../lib/screenLabels.ts';

type PlayerUsage = { player_id: string; nickname: string; visits: number; active_days: number; last_seen_at: string; screens: Array<{ name: string; visits: number }> };
type PlayersUsage = { players: PlayerUsage[] };

const lastSeen = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const times = (count: number) => (count % 10 === 1 && count % 100 !== 11 ? `${count} раз` : `${count} раз${count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'а' : ''}`);

/**
 * Where every player went (owner, 2026-10-13): one row per player — how many times he came, when he was last seen and the
 * screens he opened, in plain Russian. The old totals by «surface» are gone: the organizers' numbers counted every session
 * and were huge and meaningless.
 */
export const AppUsagePanel: React.FC<{ period: string; active?: boolean }> = ({ period, active = true }) => {
  const query = useAnalyticsQuery<PlayersUsage>('/api/ui-events/players?period=' + encodeURIComponent(period), active);
  const [filter, setFilter] = useState('');
  const all = query.data?.players ?? [];
  const players = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase('ru-RU');
    return all.filter((player) => !needle || player.nickname.toLocaleLowerCase('ru-RU').includes(needle));
  }, [all, filter]);

  return (
    <section className={analyticsCard} data-testid="crm-app-usage">
      <AnalyticsHeading title="Кто куда заходил" help="usage" caption="Каждый игрок: сколько раз заходил и какие экраны открывал" />
      <AnalyticsStatus {...query} />
      <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Найти игрока по нику" aria-label="Найти игрока" className="mobile-field mt-3" />
      {query.data && !all.length ? <p className="mt-3 rounded-[11px] bg-surface-2 p-3 text-[12px] text-text-secondary">За этот период данных нет. История по игрокам копится с момента, когда события начали записываться с именем.</p> : null}
      {all.length > 0 ? <p className="mt-3 text-[12px] text-text-muted" data-testid="crm-app-usage-count">Игроков: {players.length}</p> : null}
      <div className="mt-2 space-y-2">
        {players.map((player) => (
          <article key={player.player_id} data-testid="crm-app-usage-player" className="rounded-[14px] bg-surface-2 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="min-w-0 truncate text-[14px] font-bold text-text-primary">{player.nickname}</h4>
              <span className="shrink-0 text-[12px] text-text-secondary">заходил {times(player.visits)}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-text-muted">последний раз {lastSeen(player.last_seen_at)} · дней в приложении: {player.active_days}</div>
            {player.screens.length ? <div className="mt-2 flex flex-wrap gap-1.5">{player.screens.map((screen) => <span key={screen.name} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-1 px-2.5 py-1 text-[12px] text-text-primary"><span className="truncate">{screenName(screen.name)}</span><b className="text-text-secondary">{screen.visits}</b></span>)}</div> : null}
          </article>
        ))}
      </div>
    </section>
  );
};

export default AppUsagePanel;
