import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { actionLabel, screenLabel } from '../../lib/screenLabels.ts';

type Activity = {
  days: number;
  tracking_since: string | null;
  last_seen_at: string | null;
  visits: { total: number; last_7_days: number; today: number };
  active_days: number;
  by_day: Array<{ day: string; visits: number; events: number }>;
  top_screens: Array<{ name: string; opens: number }>;
  top_actions: Array<{ name: string; count: number }>;
  recent: Array<{ at: string; kind: 'screen' | 'action'; name: string }>;
  online_now: { screen: string; on_screen_seconds: number } | null;
};

const dateTime = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
  : '—';
const dayText = (day: string) => new Date(`${day}T12:00:00+03:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'Europe/Moscow' });
const visitsWord = (count: number) => (count % 10 === 1 && count % 100 !== 11 ? 'заход' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'захода' : 'заходов');

/**
 * «Активность в приложении» in the CRM player card (owner request, 2026-10-05): when the player was last seen, how often he
 * came, which screens he opened and which buttons he pressed. Organizers only; players are not told. The history starts when
 * the app began to attach the player to his events, so an empty card does not mean he never came.
 */
export default function PlayerActivityCard({ playerId }: { playerId: string }) {
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null); setError('');
    void fetch(`/api/ui-events/players/${encodeURIComponent(playerId)}?days=30`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить активность');
        if (!cancelled) setData(body as Activity);
      })
      .catch((reason: any) => { if (!cancelled) setError(reason?.message || 'Не удалось загрузить активность'); });
    return () => { cancelled = true; };
  }, [playerId]);

  return (
    <section data-testid="player-activity" className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-info" /><h3 className="text-[14px] font-black">Активность в приложении</h3></div>
      <p className="mt-1 text-[11px] leading-4 text-text-muted">Заходы и нажатия за 30 дней. Видите только вы и организаторы, игрок об этом не знает.</p>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
      {!data && !error ? <p className="mt-3 text-[12px] text-text-secondary">Загружаем…</p> : null}
      {data ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-[12px] bg-surface-2 p-2.5"><div className="text-[18px] font-black">{data.visits.last_7_days}</div><div className="text-[11px] text-text-muted">за 7 дней</div></div>
            <div className="rounded-[12px] bg-surface-2 p-2.5"><div className="text-[18px] font-black">{data.visits.total}</div><div className="text-[11px] text-text-muted">за 30 дней</div></div>
            <div className="rounded-[12px] bg-surface-2 p-2.5"><div className="text-[18px] font-black">{data.active_days}</div><div className="text-[11px] text-text-muted">дней заходил</div></div>
          </div>
          <div className="text-[12px] text-text-secondary">
            {data.online_now ? <span className="font-semibold text-success">Сейчас в приложении: {screenLabel(data.online_now.screen)}</span>
              : data.last_seen_at ? <>Был в приложении: <strong className="text-text-primary">{dateTime(data.last_seen_at)}</strong></> : 'В приложении ещё не был (или это было до начала учёта).'}
            {data.tracking_since ? <span className="block text-[11px] text-text-muted">Учёт ведётся с {dateTime(data.tracking_since)}</span> : null}
          </div>

          {data.top_screens.length ? <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Где бывает</div>
            <ul className="mt-1.5 space-y-1">{data.top_screens.map((item) => <li key={item.name} className="flex items-center justify-between gap-3 text-[12px]"><span className="min-w-0 truncate">{screenLabel(item.name)}</span><span className="shrink-0 text-text-muted">{item.opens}</span></li>)}</ul>
          </div> : null}

          {data.top_actions.length ? <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Куда нажимал</div>
            <ul className="mt-1.5 space-y-1">{data.top_actions.map((item) => <li key={item.name} className="flex items-center justify-between gap-3 text-[12px]"><span className="min-w-0 truncate">{actionLabel(item.name)}</span><span className="shrink-0 text-text-muted">{item.count}</span></li>)}</ul>
          </div> : null}

          {data.by_day.length ? <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">По дням</div>
            <ul className="mt-1.5 space-y-1">{data.by_day.map((item) => <li key={item.day} className="flex items-center justify-between gap-3 text-[12px]"><span>{dayText(item.day)}</span><span className="text-text-muted">{item.visits} {visitsWord(item.visits)}</span></li>)}</ul>
          </div> : null}

          {data.recent.length ? <details className="rounded-[12px] bg-surface-2 px-3 py-2">
            <summary className="cursor-pointer text-[12px] font-semibold">Последние шаги</summary>
            <ul className="mt-2 space-y-1">{data.recent.map((item, index) => <li key={`${item.at}:${index}`} className="flex items-start justify-between gap-3 text-[12px]"><span className="min-w-0">{item.kind === 'screen' ? 'Открыл' : 'Нажал'}: {item.kind === 'screen' ? screenLabel(item.name) : actionLabel(item.name)}</span><span className="shrink-0 text-text-muted">{dateTime(item.at)}</span></li>)}</ul>
          </details> : null}
        </div>
      ) : null}
    </section>
  );
}
