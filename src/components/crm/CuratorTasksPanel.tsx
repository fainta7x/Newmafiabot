import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Plus, X } from 'lucide-react';
import { curatorAreaLabel, type CuratorArea } from '../../lib/curatorAreas.ts';
import MobileSheet from '../ui/MobileSheet.tsx';

type Task = { id: string; curator_player_id: string; curator_nickname: string; area: CuratorArea | null; title: string; description: string | null; due_at: string | null; status: string; done_note: string | null; completed_at: string | null };
type Curator = { id: string; nickname: string; areas: CuratorArea[] };
type Payload = { open: Task[]; closed: Task[]; curators: Curator[] };

const day = (value: string) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const send = async (url: string, body?: unknown) => {
  const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Не получилось');
  return data;
};

/** «Задачи кураторов» under «Дела» (owner, 2026-10-01): give a curator a task and see what is done. */
export default function CuratorTasksPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [curatorId, setCuratorId] = useState('');
  const [area, setArea] = useState('');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/curator-tasks', { credentials: 'include', cache: 'no-store' });
      if (response.ok) setData(await response.json());
    } catch { /* the panel is optional */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const curator = data?.curators.find((item) => item.id === curatorId) || null;
  const create = async () => {
    if (busy || !curatorId || !title.trim()) return;
    setBusy('create'); setError('');
    try {
      await send('/api/curator-tasks', { curator_player_id: curatorId, area: area || undefined, title, due_at: due ? `${due}T21:00:00+03:00` : undefined });
      setOpen(false); setTitle(''); setDue(''); setArea('');
      await load();
    } catch (createError: any) { setError(createError?.message || 'Не получилось'); } finally { setBusy(''); }
  };
  const cancel = async (task: Task) => {
    if (busy || !window.confirm(`Отменить задачу «${task.title}»?`)) return;
    setBusy(task.id);
    try { await send(`/api/curator-tasks/${encodeURIComponent(task.id)}/cancel`); await load(); } finally { setBusy(''); }
  };

  if (!data) return null;
  const overdue = (task: Task) => Boolean(task.due_at && new Date(task.due_at).getTime() < Date.now());
  return (
    <section data-testid="curator-tasks" className="rounded-[18px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent/10 text-accent"><ClipboardList className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-text-primary">Задачи кураторов{data.open.length ? ` · ${data.open.length}` : ''}</h3>
          <p className="text-[12px] leading-4 text-text-muted">Куратор видит задачу у себя на главной и отмечает «Сделано».</p>
        </div>
        <button type="button" disabled={!data.curators.length} onClick={() => { setError(''); setCuratorId(data.curators[0]?.id || ''); setOpen(true); }}
          className="flex min-h-10 shrink-0 items-center gap-1 rounded-[10px] bg-accent px-3 text-[12px] font-bold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Задача</button>
      </div>
      {!data.curators.length ? <p className="mt-3 text-[12px] text-text-muted">Кураторов пока нет — отметьте направление в статусе игрока («Куратор направления»).</p> : null}
      {data.open.length ? <div className="mt-3 space-y-1.5">
        {data.open.map((task) => (
          <div key={task.id} data-testid="curator-task" className="flex items-start gap-2 rounded-[12px] bg-surface-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <strong className="block text-[13px] text-text-primary">{task.title}</strong>
              <span className={`block text-[11px] ${overdue(task) ? 'text-danger' : 'text-text-muted'}`}>{task.curator_nickname}{task.area ? ` · ${curatorAreaLabel(task.area)}` : ''}{task.due_at ? ` · срок ${day(task.due_at)}${overdue(task) ? ' — прошёл' : ''}` : ''}</span>
            </span>
            <button type="button" aria-label="Отменить задачу" disabled={Boolean(busy)} onClick={() => void cancel(task)} className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-text-muted"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div> : data.curators.length ? <p className="mt-3 text-[12px] text-text-muted">Открытых задач нет.</p> : null}
      {data.closed.filter((task) => task.status === 'done').length ? <details className="mt-3">
        <summary className="min-h-9 cursor-pointer text-[12px] font-semibold text-text-secondary">Сделано недавно</summary>
        <div className="mt-1.5 space-y-1.5">{data.closed.filter((task) => task.status === 'done').map((task) => (
          <div key={task.id} className="rounded-[12px] bg-surface-2 px-3 py-2 text-[12px]">
            <span className="flex items-center gap-1.5 font-semibold text-text-primary"><CheckCircle2 className="h-3.5 w-3.5 text-success" />{task.title}</span>
            <span className="block text-[11px] text-text-muted">{task.curator_nickname}{task.completed_at ? ` · ${day(task.completed_at)}` : ''}{task.done_note ? ` · «${task.done_note}»` : ''}</span>
          </div>
        ))}</div>
      </details> : null}

      <MobileSheet open={open} onClose={() => setOpen(false)} title="Задача куратору" widthClass="sm:max-w-md"
        footer={<button type="button" disabled={Boolean(busy) || !curatorId || !title.trim()} onClick={() => void create()} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[13px] font-bold text-white disabled:opacity-40">{busy === 'create' ? 'Отправляем…' : 'Поставить задачу'}</button>}>
        <div className="space-y-3">
          {error ? <p className="rounded-[12px] bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
          <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-text-secondary">Куратор</span>
            <select value={curatorId} onChange={(event) => { setCuratorId(event.target.value); setArea(''); }} className="mobile-field">
              {data.curators.map((item) => <option key={item.id} value={item.id}>{item.nickname} — {item.areas.map((value) => curatorAreaLabel(value).toLowerCase()).join(', ')}</option>)}
            </select></label>
          {curator && curator.areas.length > 1 ? <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-text-secondary">Направление</span>
            <select value={area} onChange={(event) => setArea(event.target.value)} className="mobile-field">
              <option value="">Любое</option>
              {curator.areas.map((value) => <option key={value} value={value}>{curatorAreaLabel(value)}</option>)}
            </select></label> : null}
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="Что сделать" className="mobile-field" />
          <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-text-secondary">Срок — необязательно</span>
            <input type="date" value={due} onChange={(event) => setDue(event.target.value)} className="mobile-field" /></label>
          <p className="text-[11px] leading-4 text-text-muted">Куратору придёт сообщение в боте.</p>
        </div>
      </MobileSheet>
    </section>
  );
}
