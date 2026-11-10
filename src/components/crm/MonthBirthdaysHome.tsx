import { useEffect, useState } from 'react';
import { Cake } from 'lucide-react';
import { getJson } from '../../lib/requestJson.ts';

type Birthday = { player_id: string; nickname: string; date_label: string; days_left: number };
type Nearest = { window_days: number; with_date: number; total: number; items: Birthday[] };

const when = (days: number) => (days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} дн.`);

/** «Ближайшие дни рождения» for the CRM home (owner, 2026-11-10): the next 45 days, always on the screen so it can be found. */
export default function MonthBirthdaysHome({ onOpenPlayer }: { onOpenPlayer?: (playerId: string) => void }) {
  const [data, setData] = useState<Nearest | null>(null);
  useEffect(() => { let alive = true; getJson<Nearest>('/api/crm/birthdays', 'Не удалось загрузить дни рождения').then((body) => { if (alive && body && Array.isArray((body as Nearest).items)) setData(body); }).catch(() => undefined); return () => { alive = false; }; }, []);
  if (!data) return null;
  return <section data-testid="crm-month-birthdays" aria-label="Ближайшие дни рождения" className="rounded-[18px] border border-border-soft bg-surface-1 p-3">
    <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent/10 text-accent"><Cake className="h-4 w-4" /></span><h3 className="min-w-0 flex-1 text-[15px] font-bold text-text-primary">Ближайшие дни рождения{data.items.length ? <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 align-middle text-[12px] font-bold text-text-secondary">{data.items.length}</span> : null}</h3></div>
    {data.items.length ? <div className="mt-2 space-y-1.5">{data.items.map((item) => <button key={item.player_id} type="button" onClick={() => onOpenPlayer?.(item.player_id)} className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-surface-2 px-3 text-left">
      <span className="min-w-0 flex-1 break-words text-[14px] font-semibold text-text-primary">{item.nickname}</span>
      <span className="shrink-0 text-right text-[12px] text-text-secondary">{item.date_label}<span className={`block ${item.days_left === 0 ? 'font-bold text-accent' : 'text-text-muted'}`}>{when(item.days_left)}</span></span>
    </button>)}</div> : <p className="mt-2 text-[12px] leading-4 text-text-muted">В ближайшие {data.window_days} дней дней рождения нет. Дата указана у {data.with_date} из {data.total} игроков.</p>}
  </section>;
}
