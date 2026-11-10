import { useEffect, useState } from 'react';
import { Cake } from 'lucide-react';
import { getJson } from '../../lib/requestJson.ts';

type Birthday = { player_id: string; nickname: string; day: number; date_label: string; days_left: number };
type Month = { month_label: string; items: Birthday[] };

const when = (days: number) => (days === 0 ? 'сегодня' : days === 1 ? 'завтра' : days > 1 ? `через ${days} дн.` : '');

/** «Дни рождения в этом месяце» for the CRM home (owner, 2026-11-10): upcoming ones in sight, the passed ones folded. Hidden when nobody has a birthday. */
export default function MonthBirthdaysHome({ onOpenPlayer }: { onOpenPlayer?: (playerId: string) => void }) {
  const [data, setData] = useState<Month | null>(null);
  useEffect(() => { let alive = true; getJson<Month>('/api/crm/birthdays', 'Не удалось загрузить дни рождения').then((body) => { if (alive) setData(body); }).catch(() => undefined); return () => { alive = false; }; }, []);
  if (!data?.items.length) return null;
  const upcoming = data.items.filter((item) => item.days_left >= 0);
  const passed = data.items.filter((item) => item.days_left < 0);
  const row = (item: Birthday, muted = false) => <button key={item.player_id} type="button" onClick={() => onOpenPlayer?.(item.player_id)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl bg-surface-2 px-3 text-left ${muted ? 'opacity-70' : ''}`}>
    <span className="min-w-0 flex-1 break-words text-[14px] font-semibold text-text-primary">{item.nickname}</span>
    <span className="shrink-0 text-right text-[12px] text-text-secondary">{item.date_label}{when(item.days_left) ? <span className={`block ${item.days_left === 0 ? 'font-bold text-accent' : 'text-text-muted'}`}>{when(item.days_left)}</span> : null}</span>
  </button>;
  return <section data-testid="crm-month-birthdays" aria-label="Дни рождения" className="rounded-[18px] border border-border-soft bg-surface-1 p-3">
    <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent/10 text-accent"><Cake className="h-4 w-4" /></span><h3 className="min-w-0 flex-1 text-[15px] font-bold text-text-primary">Дни рождения в {data.month_label}<span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 align-middle text-[12px] font-bold text-text-secondary">{data.items.length}</span></h3></div>
    {upcoming.length ? <div className="mt-2 space-y-1.5">{upcoming.map((item) => row(item))}</div> : <p className="mt-2 text-[12px] text-text-muted">В этом месяце больше нет.</p>}
    {passed.length ? <details className="mt-2"><summary className="flex min-h-10 cursor-pointer list-none items-center text-[12px] font-semibold text-text-muted">Уже прошли · {passed.length}</summary><div className="mt-1 space-y-1.5">{passed.map((item) => row(item, true))}</div></details> : null}
  </section>;
}
