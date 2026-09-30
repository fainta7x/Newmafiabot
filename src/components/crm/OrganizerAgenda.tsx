import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronDown, ClipboardCheck, Clock3, RefreshCw, Send } from 'lucide-react';
import type { EveningSection } from './EveningWorkspace.tsx';

type Group = 'now' | 'week' | 'later';
type Action =
  | { type: 'evening'; evening_id: string; section: EveningSection }
  | { type: 'player'; player_id: string }
  | { type: 'create_evening' }
  | { type: 'cancel_evening'; evening_id: string }
  | { type: 'task'; task_id: string };
type Person = { player_id: string; nickname: string; detail?: string; telegram_url?: string | null; vk_url?: string | null };
type Item = {
  id: string; group: Group; kind: string; title: string; why: string;
  action?: Action; action_label?: string; people?: Person[]; people_total?: number;
  contact_reason?: string; task_id?: string; can_complete?: boolean; dismiss_label?: string;
};
type Payload = { items: Item[]; counts: Record<Group, number>; total: number; snoozed: number; groups: Record<Group, string> };

const GROUPS: Group[] = ['now', 'week', 'later'];
const GROUP_HINT: Record<Group, string> = {
  now: 'Сегодня и то, что уже горит',
  week: 'Сделать до конца недели',
  later: 'Порядок в клубе и общение с игроками',
};
const SNOOZE: Array<[number, string]> = [[1, 'До завтра'], [3, 'На 3 дня'], [7, 'На неделю'], [30, 'На месяц']];

const post = async (url: string, body: unknown, method = 'POST') => {
  const response = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Не получилось');
  return data;
};

/**
 * «Дела» (owner, 2026-09-30): one list instead of «Задачи» and «Порядок в клубе», grouped by when it matters.
 * The home screen shows the «Сейчас» part and counts; the full list lives under «Ещё → Дела».
 */
export default function OrganizerAgenda({ mode = 'full', refreshKey = 0, onOpenEveningSection, onOpenPlayer, onCreateEvening, onOpenAll, onOpenTaskList }: {
  mode?: 'preview' | 'full';
  refreshKey?: number;
  onOpenEveningSection: (id: string, section: EveningSection) => void;
  onOpenPlayer: (id: string) => void;
  onCreateEvening: () => void;
  onOpenAll?: () => void;
  onOpenTaskList?: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [snoozeFor, setSnoozeFor] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/crm/agenda', { credentials: 'include', cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body?.items)) throw new Error(body?.error || 'Не удалось загрузить дела');
      setData(body as Payload);
      setError('');
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить дела');
    }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  const act = async (key: string, work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    setError('');
    try { await work(); await load(); } catch (actError: any) { setError(actError?.message || 'Не получилось'); } finally { setBusy(''); }
  };

  const run = (item: Item) => {
    const action = item.action;
    if (!action) return;
    if (action.type === 'cancel_evening') {
      if (!window.confirm('Отменить вечер? Всем записавшимся придёт сообщение об отмене.')) return;
      void act(item.id, () => post(`/api/evenings/${encodeURIComponent(action.evening_id)}`, { status: 'cancelled', cancel_reason: 'shortfall' }, 'PATCH'));
    } else if (action.type === 'evening') onOpenEveningSection(action.evening_id, action.section);
    else if (action.type === 'player') onOpenPlayer(action.player_id);
    else if (action.type === 'create_evening') onCreateEvening();
  };

  const card = (item: Item) => {
    const peopleOpen = open[item.id] ?? (mode === 'full' && (item.people?.length || 0) <= 5);
    return (
      <div key={item.id} data-testid={`agenda-item-${item.id}`} className="rounded-[14px] bg-surface-2 p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <strong className="block text-[14px] leading-5 text-text-primary">{item.title}</strong>
            <span className="mt-0.5 block text-[12px] leading-4 text-text-secondary">{item.why}</span>
          </div>
          {item.action && item.action.type !== 'task' ? (
            <button type="button" disabled={busy === item.id} onClick={() => run(item)} className="flex min-h-10 shrink-0 items-center gap-1 rounded-[10px] bg-accent px-3 text-[12px] font-bold text-white disabled:opacity-50">
              {item.action_label || 'Открыть'}<ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {item.people?.length ? (
          <div className="mt-2">
            <button type="button" onClick={() => setOpen((value) => ({ ...value, [item.id]: !peopleOpen }))} className="flex min-h-9 items-center gap-1 text-[12px] font-semibold text-accent">
              <ChevronDown className={`h-4 w-4 transition-transform ${peopleOpen ? 'rotate-180' : ''}`} />{peopleOpen ? 'Скрыть список' : `Показать: ${item.people_total ?? item.people.length}`}
            </button>
            {peopleOpen ? (
              <div className="mt-1 space-y-1.5">
                {item.people.map((person) => (
                  <div key={`${item.id}:${person.player_id}`} data-testid="agenda-person" className="rounded-[11px] bg-surface-1 px-2.5 py-2">
                    <button type="button" onClick={() => onOpenPlayer(person.player_id)} className="block w-full min-w-0 text-left">
                      <strong className="block truncate text-[13px] text-text-primary">{person.nickname}</strong>
                      {person.detail ? <span className="block truncate text-[11px] text-text-muted">{person.detail}</span> : null}
                    </button>
                    {item.contact_reason ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {person.telegram_url ? <a href={person.telegram_url} target="_blank" rel="noreferrer" className="flex min-h-9 items-center gap-1 rounded-[9px] border border-border-soft px-2.5 text-[12px] font-semibold text-text-primary"><Send className="h-3.5 w-3.5" />Telegram</a> : null}
                        {person.vk_url ? <a href={person.vk_url} target="_blank" rel="noreferrer" className="flex min-h-9 items-center rounded-[9px] border border-border-soft px-2.5 text-[12px] font-semibold text-text-primary">VK</a> : null}
                        <button type="button" disabled={Boolean(busy)} onClick={() => void act(`${item.id}:${person.player_id}`, () => post('/api/crm/agenda/contacted', { player_id: person.player_id, reason: item.contact_reason }))}
                          className="flex min-h-9 items-center gap-1 rounded-[9px] bg-success-soft px-2.5 text-[12px] font-bold text-success disabled:opacity-50">
                          <Check className="h-3.5 w-3.5" />{busy === `${item.id}:${person.player_id}` ? '…' : 'Написал'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {(item.people_total || 0) > item.people.length ? <p className="px-1 text-[11px] text-text-muted">и ещё {(item.people_total || 0) - item.people.length} — появятся, когда отметишь этих</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.can_complete && item.task_id ? (
            <button type="button" disabled={Boolean(busy)} onClick={() => void act(item.id, () => post(`/api/tasks/${encodeURIComponent(item.task_id!)}/complete`, {}))} className="flex min-h-9 items-center gap-1 rounded-[9px] bg-success-soft px-2.5 text-[12px] font-bold text-success disabled:opacity-50"><Check className="h-3.5 w-3.5" />Готово</button>
          ) : null}
          {item.dismiss_label ? (
            <button type="button" disabled={Boolean(busy)} onClick={() => void act(item.id, () => post('/api/crm/club-order/dismiss', { id: item.id.replace(/^check:/, '') }))} className="min-h-9 rounded-[9px] border border-border-soft px-2.5 text-[12px] font-semibold text-text-secondary disabled:opacity-50">{item.dismiss_label}</button>
          ) : null}
          {snoozeFor === item.id ? SNOOZE.map(([days, label]) => (
            <button key={days} type="button" disabled={Boolean(busy)} onClick={() => { setSnoozeFor(''); void act(item.id, () => post('/api/crm/agenda/snooze', { item_id: item.id, days })); }} className="min-h-9 rounded-[9px] border border-border-soft px-2.5 text-[12px] font-semibold text-text-secondary">{label}</button>
          )) : (
            <button type="button" onClick={() => setSnoozeFor(item.id)} className="flex min-h-9 items-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold text-text-muted"><Clock3 className="h-3.5 w-3.5" />Отложить</button>
          )}
        </div>
      </div>
    );
  };

  const nowItems = data?.items.filter((item) => item.group === 'now') || [];
  const previewItems = nowItems.length ? nowItems.slice(0, 4) : (data?.items || []).slice(0, 3);

  return (
    <section data-testid={mode === 'preview' ? 'agenda-preview' : 'agenda'} aria-label="Дела" className="rounded-[18px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent/10 text-accent"><ClipboardCheck className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-text-primary">Дела{data?.total ? <span data-testid="agenda-count" className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 align-middle text-[12px] font-bold text-warning">{data.total}</span> : null}</h3>
          <p className="text-[12px] leading-4 text-text-muted">{mode === 'preview' ? 'Самое срочное. Дело уходит само, когда сделано.' : 'Дело уходит само, когда сделано. Людей из списка отмечай «Написал».'}</p>
        </div>
        <button type="button" onClick={() => void load()} aria-label="Обновить дела" className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-text-muted"><RefreshCw className={`h-4 w-4 ${!data && !error ? 'animate-spin' : ''}`} /></button>
      </div>
      {error ? <p className="mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      {data && !data.items.length ? (
        <div className="mt-3 flex min-h-11 items-center gap-2 rounded-[12px] bg-success-soft px-3 text-[13px] text-success"><CheckCircle2 className="h-4 w-4" /> Дел нет — всё в порядке{data.snoozed ? ` (отложено: ${data.snoozed})` : ''}.</div>
      ) : null}

      {data?.items.length && mode === 'preview' ? (
        <div className="mt-3 space-y-2">
          {previewItems.map(card)}
          <button type="button" data-testid="agenda-open-all" onClick={onOpenAll} className="flex min-h-11 w-full items-center justify-between rounded-[12px] border border-border-soft px-3 text-left text-[13px] font-semibold text-text-primary">
            <span>Все дела · {data.total}<span className="ml-1 font-normal text-text-muted">({GROUPS.filter((group) => data.counts[group]).map((group) => `${data.groups[group].toLowerCase()} ${data.counts[group]}`).join(', ')})</span></span>
            <ArrowRight className="h-4 w-4 text-text-muted" />
          </button>
        </div>
      ) : null}

      {data?.items.length && mode === 'full' ? (
        <div className="mt-3 space-y-4">
          {GROUPS.filter((group) => data.counts[group]).map((group) => (
            <div key={group} data-testid={`agenda-group-${group}`}>
              <div className="px-0.5"><span className="text-[13px] font-bold text-text-primary">{data.groups[group]} · {data.counts[group]}</span><span className="block text-[11px] text-text-muted">{GROUP_HINT[group]}</span></div>
              <div className="mt-1.5 space-y-2">{data.items.filter((item) => item.group === group).map(card)}</div>
            </div>
          ))}
          {data.snoozed ? <p className="px-0.5 text-[11px] text-text-muted">Отложено: {data.snoozed}. Вернутся сами, если ещё будут нужны.</p> : null}
        </div>
      ) : null}
      {mode === 'full' && onOpenTaskList ? (
        <button type="button" onClick={onOpenTaskList} className="mt-3 min-h-10 w-full rounded-[10px] border border-border-soft px-3 text-[12px] font-semibold text-text-secondary">Свои задачи и выполненные</button>
      ) : null}
    </section>
  );
}
