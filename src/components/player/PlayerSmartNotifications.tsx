import { useEffect, useState } from 'react';

type NotificationItem = {
  key: string;
  type: string;
  icon: string;
  title: string;
  text: string;
  date: string;
  read: boolean;
  action?: { kind: string; target?: string };
};

type NotificationData = {
  unread: number;
  items: NotificationItem[];
  generated_at: string;
};

type Journey =
  | { phase: 'idle' }
  | {
      phase: 'upcoming';
      evening: { id: string; title: string; starts_at: string | null; venue: string | null };
      participation: { response_status: string };
    }
  | {
      phase: 'live';
      evening: { id: string; title: string; starts_at: string | null; venue: string | null };
      participation: { state: string; seat_number: number | null };
      score: { red: number; black: number; completed: number };
      current_game: { local_number: number } | null;
    }
  | {
      phase: 'recap';
      recap: { id: string; title: string; starts_at: string; score: string; player: { wins: number; games: number } };
    };

export type PlayerNotificationDestination = 'home' | 'events' | 'games' | 'club' | 'elo' | 'recaps';

const relativeText = (value: string) => {
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  if (!Number.isFinite(diff)) return '';
  const abs = Math.abs(diff);
  if (abs < 60 * 60 * 1000) {
    const minutes = Math.max(1, Math.round(abs / (60 * 1000)));
    return diff >= 0 ? `через ${minutes} мин.` : `${minutes} мин. назад`;
  }
  if (abs < 24 * 60 * 60 * 1000) {
    const hours = Math.max(1, Math.round(abs / (60 * 60 * 1000)));
    return diff >= 0 ? `через ${hours} ч.` : `${hours} ч. назад`;
  }
  const days = Math.max(1, Math.round(abs / (24 * 60 * 60 * 1000)));
  return diff >= 0 ? `через ${days} дн.` : `${days} дн. назад`;
};

const compactDate = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

const responseText = (value: string) => value === 'going'
  ? 'Ты идёшь'
  : value === 'late'
    ? 'Придёшь позже'
    : value === 'thinking'
      ? 'Пока думаешь'
      : value === 'declined'
        ? 'Не идёшь'
        : 'Запись открыта';

export default function PlayerSmartNotifications({
  onNavigate,
}: {
  onNavigate?: (destination: PlayerNotificationDestination, target?: string | null) => void;
}) {
  const [data, setData] = useState<NotificationData | null>(null);
  const [journey, setJourney] = useState<Journey>({ phase: 'idle' });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [notificationsResult, journeyResult] = await Promise.allSettled([
      fetch('/api/player/notifications', { credentials: 'include' }),
      fetch('/api/player/evening-journey', { credentials: 'include', cache: 'no-store' }),
    ]);

    if (notificationsResult.status === 'fulfilled' && notificationsResult.value.ok) {
      const body = await notificationsResult.value.json().catch(() => ({}));
      setData(body as NotificationData);
    }

    if (journeyResult.status === 'fulfilled' && journeyResult.value.ok) {
      const body = await journeyResult.value.json().catch(() => ({}));
      setJourney((body?.journey || { phase: 'idle' }) as Journey);
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const markVisibleRead = async () => {
    if (!data) return;
    const keys = data.items.filter((item) => !item.read).map((item) => item.key);
    if (!keys.length) return;
    setData((current) => current ? { ...current, unread: 0, items: current.items.map((item) => ({ ...item, read: true })) } : current);
    try {
      await fetch('/api/player/notifications/read', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      });
    } catch {
      // The next refresh can retry marking them read.
    }
  };

  const openInbox = () => {
    setOpen(true);
    void markVisibleRead();
    void load();
  };

  const activate = (item: NotificationItem) => {
    const kind = item.action?.kind;
    const target = item.action?.target || null;
    if (kind === 'player_home') onNavigate?.('home', target);
    else if (kind === 'games' || kind === 'game_center') onNavigate?.('games', target);
    else if (kind === 'elo_journey') onNavigate?.('elo', target);
    else if (kind === 'evening_summary') onNavigate?.('recaps', target);
    else if (kind === 'club' || kind === 'stories') onNavigate?.('club', target);
    setOpen(false);
  };

  const openJourney = () => {
    if (journey.phase === 'upcoming') onNavigate?.('events', journey.evening.id);
    else if (journey.phase === 'live') onNavigate?.('games');
    else if (journey.phase === 'recap') onNavigate?.('recaps', journey.recap.id);
    setOpen(false);
  };

  const journeyTitle = journey.phase === 'upcoming'
    ? journey.evening.title
    : journey.phase === 'live'
      ? journey.evening.title
      : journey.phase === 'recap'
        ? journey.recap.title
        : '';
  const journeyText = journey.phase === 'upcoming'
    ? `${compactDate(journey.evening.starts_at)} · ${responseText(journey.participation.response_status)}`
    : journey.phase === 'live'
      ? `${journey.current_game ? `Игра ${journey.current_game.local_number}` : 'Между играми'} · счёт ${journey.score.red}:${journey.score.black}`
      : journey.phase === 'recap'
        ? `Итог ${journey.recap.score} · у тебя ${journey.recap.player.wins}/${journey.recap.player.games}`
        : '';

  if (loading && !data) return null;

  return <>
    <button type="button" onClick={openInbox} aria-label="Уведомления" className="fixed right-3 top-3 z-[55] grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-[#1b1c21]/95 text-base text-white/70 shadow-xl backdrop-blur">
      🔔
      {journey.phase !== 'idle' && <span className={`absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#1b1c21] ${journey.phase === 'live' ? 'bg-rose-400' : 'bg-amber-200'}`} />}
      {Boolean(data?.unread) && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">{Math.min(9, data?.unread || 0)}{(data?.unread || 0) > 9 ? '+' : ''}</span>}
    </button>

    {open && <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Уведомления" onClick={(event) => event.stopPropagation()} className="max-h-[82dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#111217] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Для тебя</div><h2 className="mt-1 text-xl font-semibold">Уведомления</h2><p className="mt-1 text-xs text-white/35">Важное состояние клуба без плашек поверх экранов.</p></div><button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-lg text-white/55">×</button></div>

        {journey.phase !== 'idle' && (
          <button type="button" onClick={openJourney} className={`mt-4 flex w-full items-center gap-3 rounded-[22px] border p-3 text-left ${journey.phase === 'live' ? 'border-rose-400/20 bg-rose-400/[0.06]' : 'border-amber-200/15 bg-amber-200/[0.04]'}`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${journey.phase === 'live' ? 'bg-rose-400/10 text-rose-300' : 'bg-amber-200/[0.07] text-amber-100'}`}>{journey.phase === 'live' ? '●' : journey.phase === 'recap' ? '✓' : '▣'}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.15em] text-white/30">{journey.phase === 'live' ? 'Сейчас идёт вечер' : journey.phase === 'recap' ? 'Последний вечер' : 'Ближайший вечер'}</span>
              <span className="mt-1 block truncate text-sm font-semibold">{journeyTitle}</span>
              <span className="mt-1 block truncate text-[10px] text-white/35">{journeyText}</span>
            </span>
            <span className="text-lg text-white/20">›</span>
          </button>
        )}

        {data?.items.length ? <div className="mt-4 space-y-2">{data.items.map((item) => <button key={item.key} type="button" onClick={() => activate(item)} className="flex w-full items-start gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.03] p-3 text-left"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/20 text-lg">{item.icon}</div><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{item.title}</div><div className="mt-1 text-[10px] leading-4 text-white/35">{item.text}</div><div className="mt-1.5 text-[9px] text-white/20">{relativeText(item.date)}</div></div>{item.action ? <span className="mt-2 text-white/20">›</span> : null}</button>)}</div> : journey.phase === 'idle' ? <div className="mt-5 rounded-2xl bg-white/[0.035] px-4 py-8 text-center"><div className="text-2xl">✨</div><div className="mt-2 text-sm font-semibold">Всё спокойно</div><p className="mt-1 text-xs text-white/30">Когда появится важное событие, итог вечера или изменение Elo — оно будет здесь.</p></div> : null}

        <p className="mt-4 text-[9px] leading-4 text-white/20">Уведомления формируются из текущих данных клуба и не влияют на спортивные результаты.</p>
      </section>
    </div>}
  </>;
}
