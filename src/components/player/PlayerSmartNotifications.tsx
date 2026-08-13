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

export default function PlayerSmartNotifications() {
  const [data, setData] = useState<NotificationData | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const response = await fetch('/api/player/notifications', { credentials: 'include' });
      if (!response.ok) return;
      const body = await response.json().catch(() => ({}));
      setData(body as NotificationData);
    } catch {
      // Notifications are an enhancement and must never block the player cabinet.
    } finally {
      setLoading(false);
    }
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
  };

  const activate = (item: NotificationItem) => {
    if (item.action?.kind === 'stories') {
      window.dispatchEvent(new CustomEvent('open-player-game-center', { detail: { section: 'stories', target: item.action.target || null } }));
      setOpen(false);
      return;
    }
    if (item.action?.kind === 'game_center') {
      window.dispatchEvent(new CustomEvent('open-player-game-center', { detail: { section: 'mine' } }));
      setOpen(false);
      return;
    }
    setOpen(false);
  };

  if (loading && !data) return null;

  return <>
    <button type="button" onClick={openInbox} aria-label="Уведомления" className="fixed right-3 top-3 z-[55] grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-[#1b1c21]/95 text-base text-white/70 shadow-xl backdrop-blur">
      🔔
      {Boolean(data?.unread) && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">{Math.min(9, data?.unread || 0)}{(data?.unread || 0) > 9 ? '+' : ''}</span>}
    </button>

    {open && <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Уведомления" onClick={(event) => event.stopPropagation()} className="max-h-[82dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#111217] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Для тебя</div><h2 className="mt-1 text-xl font-semibold">Уведомления</h2><p className="mt-1 text-xs text-white/35">Только то, что влияет на твой следующий шаг или игровую историю.</p></div><button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-lg text-white/55">×</button></div>

        {data?.items.length ? <div className="mt-4 space-y-2">{data.items.map((item) => <button key={item.key} type="button" onClick={() => activate(item)} className="flex w-full items-start gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.03] p-3 text-left"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/20 text-lg">{item.icon}</div><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{item.title}</div><div className="mt-1 text-[10px] leading-4 text-white/35">{item.text}</div><div className="mt-1.5 text-[9px] text-white/20">{relativeText(item.date)}</div></div>{item.action?.kind === 'stories' || item.action?.kind === 'game_center' ? <span className="mt-2 text-white/20">›</span> : null}</button>)}</div> : <div className="mt-5 rounded-2xl bg-white/[0.035] px-4 py-8 text-center"><div className="text-2xl">✨</div><div className="mt-2 text-sm font-semibold">Всё спокойно</div><p className="mt-1 text-xs text-white/30">Когда появится важный ответ, результат, серия или голосование — оно будет здесь.</p></div>}

        <p className="mt-4 text-[9px] leading-4 text-white/20">Уведомления формируются из текущих данных клуба и не влияют на спортивные результаты.</p>
      </section>
    </div>}
  </>;
}
