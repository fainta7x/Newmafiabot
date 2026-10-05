import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { screenLabel } from '../../lib/screenLabels.ts';
import { useClubOwner } from './useClubOwner.ts';
import { AnalyticsHeading, analyticsCard } from './analyticsShared.tsx';

type Online = { player_id: string; nickname: string; screen: string; on_screen_seconds: number };

const duration = (seconds: number) => (seconds < 60 ? 'меньше минуты' : seconds < 3600 ? `${Math.floor(seconds / 60)} мин` : `${Math.floor(seconds / 3600)} ч ${Math.floor((seconds % 3600) / 60)} мин`);

/**
 * «Сейчас в приложении» (owner, 2026-09-30): who has the app open and on which screen, refreshed every
 * 15 seconds. Only the club owner sees it; players are not told.
 */
export function OnlineNowPanel({ active = true }: { active?: boolean }) {
  const owner = useClubOwner();
  const [online, setOnline] = useState<Online[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (owner !== true || !active) return undefined;
    let stopped = false;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/presence', { credentials: 'include', cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить');
        if (!stopped) { setOnline(Array.isArray(body.online) ? body.online : []); setError(''); }
      } catch (loadError: any) { if (!stopped) setError(loadError?.message || 'Не удалось загрузить'); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15_000);
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange',visible);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange',visible); };
  }, [owner, active, revision]);

  if (owner !== true) return null;
  return (
    <section data-testid="online-now" className={analyticsCard}>
      <AnalyticsHeading title="Сейчас в приложении" help="now" caption="На сегодня · последние 90 секунд · видит только владелец" />
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-success" />
        <span className="text-[14px] font-semibold">Онлайн{online ? ` · ${online.length}` : ''}</span>
      </div>
      {error ? <div className="mt-2 text-xs text-danger">{error}<button type="button" onClick={()=>setRevision(value=>value+1)} className="ml-2 min-h-11 rounded-xl bg-surface-2 px-3 text-text-primary">Повторить</button></div> : null}
      {!online && !error && <p className="mt-3 text-xs text-text-secondary">Загрузка списка…</p>}
      {online && !online.length ? <p className="mt-3 text-[12px] text-text-secondary">Сейчас никого.</p> : null}
      {online?.length ? <div className="mt-3 space-y-1.5">
        {online.map((person) => (
          <div key={person.player_id} data-testid="online-person"
            className="flex min-h-11 w-full items-center gap-2 rounded-[12px] bg-surface-2 px-3 py-2 text-left">
            <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[13px] text-text-primary">{person.nickname}</strong>
              <span className="block truncate text-[12px] text-text-muted">{screenLabel(person.screen)} · {duration(person.on_screen_seconds)}</span>
            </span>
          </div>
        ))}
      </div> : null}
    </section>
  );
}

export default OnlineNowPanel;
