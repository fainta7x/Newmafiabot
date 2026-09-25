import React, { useEffect, useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { api, type UiUsageRow, type UiUsageSummary } from '../../lib/api.ts';

const SCREEN_LABELS: Record<string, string> = {
  '/player': 'Главная',
  '/player/events': 'События',
  '/player/events/:id': 'Карточка события',
  '/player/games': 'Игры',
  '/player/rating': 'Рейтинг · Elo',
  '/player/rating/periods': 'Рейтинг · Сезон',
  '/player/rating/tournaments': 'Рейтинг · Турниры',
  '/player/club': 'Клуб',
  '/player/profile': 'Профиль',
  '/player/wallet': 'Жетоны',
  '/player/payments': 'Оплаты',
  '/player/conduct': 'Ведение игры',
  '/player/conduct/music': 'Музыка ведущего',
  '/admin': 'Сегодня',
  '/admin/evenings': 'События',
  '/admin/evenings/:id': 'Вечер · Анонс',
  '/admin/evenings/:id/participants': 'Вечер · Ответы',
  '/admin/evenings/:id/management': 'Вечер · Вечер',
  '/admin/evenings/:id/games': 'Вечер · Игры',
  '/admin/players': 'Игроки',
  '/admin/more': 'Ещё',
  '/admin/tasks': 'Задачи',
  '/admin/analytics': 'Аналитика',
};

const SURFACE_LABELS = { player: 'Игроки', crm: 'Организаторы', public: 'Публичные' } as const;

const screenLabel = (row: UiUsageRow) => SCREEN_LABELS[row.name] || row.name;

const NAV_LABELS: Record<string, string> = { home: 'Главная', events: 'События', games: 'Игры', rating: 'Рейтинг', club: 'Клуб', profile: 'Профиль' };
const ACTION_LABELS: Record<string, string> = {
  'player-quick-profile': 'Кнопка «Профиль»',
  'player-quick-wallet': 'Кнопка жетонов',
  'crm-today-evening-card': 'Карточка вечера на «Сегодня»',
};

const actionLabel = (name: string) => {
  if (ACTION_LABELS[name]) return ACTION_LABELS[name];
  const nav = name.match(/^player-nav-(.+)$/);
  if (nav) return `Меню · ${NAV_LABELS[nav[1]] || nav[1]}`;
  return name;
};

const PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, all: 180 };

/** Which screens and buttons people actually use — anonymous, from uiTelemetry. */
export const AppUsagePanel: React.FC<{ period: string }> = ({ period }) => {
  const [data, setData] = useState<UiUsageSummary | null>(null);
  const [surface, setSurface] = useState<'player' | 'crm'>('player');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    api.getUiUsageSummary(PERIOD_DAYS[period] || 30)
      .then((summary) => { if (!cancelled) setData(summary); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [period]);

  const screens = (data?.screens || []).filter((row) => row.surface === surface);
  const actions = (data?.actions || []).filter((row) => row.surface === surface);
  const maxSessions = Math.max(1, ...screens.map((row) => row.sessions));

  return (
    <section className="rounded-[16px] border border-border-soft bg-surface-1 p-4" data-testid="crm-app-usage">
      <div className="flex items-center gap-2"><MousePointerClick className="h-4 w-4 text-accent" /><h3 className="text-[14px] font-black">Как пользуются приложением</h3></div>
      <p className="mt-1 text-[12px] leading-4 text-text-secondary">Анонимно, без имён: какие экраны открывают и что нажимают.</p>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-[12px] border border-border-soft bg-surface-2 p-1 text-[13px]">
        {(['player', 'crm'] as const).map((value) => (
          <button key={value} type="button" onClick={() => setSurface(value)} className={`min-h-9 rounded-[9px] font-bold ${surface === value ? 'bg-accent text-white' : 'text-text-secondary'}`}>
            {SURFACE_LABELS[value]}{data ? ` · ${data.sessions[value]}` : ''}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 text-[12px] text-danger">Не удалось загрузить статистику использования.</p> : null}
      {data && !screens.length ? <p className="mt-3 rounded-[11px] bg-surface-2 p-3 text-[12px] text-text-secondary">Данных пока нет — они начнут появляться, когда {surface === 'player' ? 'игроки' : 'организаторы'} откроют приложение после обновления.</p> : null}
      {screens.length ? (
        <div className="mt-3 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Экраны · сколько заходов открывали</div>
          {screens.slice(0, 15).map((row) => (
            <div key={row.name} className="relative overflow-hidden rounded-[10px] bg-surface-2 px-3 py-2">
              <div className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${Math.round((row.sessions / maxSessions) * 100)}%` }} />
              <div className="relative flex items-center justify-between gap-3 text-[12px]"><span className="min-w-0 truncate text-text-primary">{screenLabel(row)}</span><strong className="shrink-0">{row.sessions}</strong></div>
            </div>
          ))}
        </div>
      ) : null}
      {actions.length ? (
        <div className="mt-4 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Нажатия · сколько раз</div>
          {actions.slice(0, 15).map((row) => (
            <div key={row.name} className="flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2 text-[12px]"><span className="min-w-0 truncate text-text-primary">{actionLabel(row.name)}</span><strong className="shrink-0">{row.events}</strong></div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default AppUsagePanel;
