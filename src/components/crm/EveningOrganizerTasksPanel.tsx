import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { MobileSheet } from '../ui/MobileSheet.tsx';

type Stage = 'preparation' | 'during' | 'after';
type Template = { id: string; title: string; description: string; stage: Stage; type: string; priority: string };
type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_at?: string | null;
  automation_key?: string | null;
  evening_id?: string | null;
};

type TaskSnapshot = {
  mode: 'active' | 'upcoming' | 'completed';
  evening: { id: string; title: string; status: string };
  attention: { tasks: Task[] };
};

type CommandSnapshot = { snapshot: TaskSnapshot | null };

const stageLabel: Record<Stage, string> = {
  preparation: 'До вечера',
  during: 'Во время',
  after: 'После',
};

const taskStage = (task: Task): Stage => {
  const key = String(task.automation_key || '');
  const match = key.match(/^evening-(?:template|manual):([^:]+):/);
  return match && ['preparation', 'during', 'after'].includes(match[1]) ? match[1] as Stage : 'during';
};

export default function EveningOrganizerTasksPanel({
  eveningId,
  onChanged,
}: {
  eveningId?: string;
  onChanged?: () => void | Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualStage, setManualStage] = useState<Stage>('during');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const templatesRequest = fetch('/api/tasks/evening-templates', { credentials: 'same-origin' });
      if (eveningId) {
        const [evening, tasks, templatesResponse] = await Promise.all([
          api.getEvening(eveningId),
          api.getTasks({ evening_id: eveningId, active: true }),
          templatesRequest,
        ]);
        const templateBody = await templatesResponse.json().catch(() => ({}));
        if (!templatesResponse.ok) throw new Error(templateBody?.error || 'Не удалось загрузить шаблоны');
        const mode: TaskSnapshot['mode'] = evening.status === 'active'
          ? 'active'
          : evening.status === 'completed' || Boolean(evening.settled_at)
            ? 'completed'
            : 'upcoming';
        setSnapshot({
          mode,
          evening: { id: String(evening.id), title: String(evening.title || 'Игровой вечер'), status: String(evening.status) },
          attention: { tasks: tasks as Task[] },
        });
        setTemplates(Array.isArray(templateBody?.templates) ? templateBody.templates : []);
        return;
      }

      const [commandResponse, templatesResponse] = await Promise.all([
        fetch('/api/crm/command-center', { credentials: 'same-origin' }),
        templatesRequest,
      ]);
      const command = await commandResponse.json().catch(() => ({})) as CommandSnapshot & { error?: string };
      const templateBody = await templatesResponse.json().catch(() => ({}));
      if (!commandResponse.ok) throw new Error(command?.error || 'Не удалось загрузить задачи вечера');
      if (!templatesResponse.ok) throw new Error(templateBody?.error || 'Не удалось загрузить шаблоны');
      setSnapshot(command?.snapshot || null);
      setTemplates(Array.isArray(templateBody?.templates) ? templateBody.templates : []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить задачи вечера');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [eveningId]);

  useEffect(() => { void load(); }, [load]);

  const tasks = snapshot?.attention.tasks || [];
  const activeStage: Stage = snapshot?.mode === 'active' ? 'during' : snapshot?.mode === 'completed' ? 'after' : 'preparation';
  const usefulTemplates = useMemo(() => templates.filter((item) => (
    item.stage === activeStage || (activeStage === 'during' && item.stage === 'after')
  )).slice(0, 6), [templates, activeStage]);

  const refreshAll = async () => {
    await load(true);
    await onChanged?.();
  };

  const addTemplate = async (templateId: string) => {
    if (!snapshot?.evening.id || busy) return;
    setBusy(`template:${templateId}`);
    setError(null);
    try {
      const response = await fetch('/api/tasks/evening-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ evening_id: snapshot.evening.id, template_id: templateId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось добавить задачу');
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Не удалось добавить задачу');
    } finally { setBusy(null); }
  };

  const addManual = async () => {
    if (!snapshot?.evening.id || !manualTitle.trim() || busy) return;
    setBusy('manual');
    setError(null);
    try {
      const response = await fetch('/api/tasks/evening-manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ evening_id: snapshot.evening.id, title: manualTitle.trim(), description: manualDescription.trim() || null, stage: manualStage }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось создать задачу');
      setManualOpen(false); setManualTitle(''); setManualDescription(''); setManualStage(activeStage);
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Не удалось создать задачу');
    } finally { setBusy(null); }
  };

  const complete = async (task: Task) => {
    if (busy) return;
    setBusy(task.id);
    try {
      await api.completeTask(task.id);
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Не удалось завершить задачу');
    } finally { setBusy(null); }
  };

  const snooze = async (task: Task) => {
    if (busy) return;
    setBusy(`snooze:${task.id}`);
    try {
      await api.updateTask(task.id, { due_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Не удалось отложить задачу');
    } finally { setBusy(null); }
  };

  if (loading || !snapshot) return null;

  const heading = snapshot.mode === 'active'
    ? 'Не забыть по ходу вечера'
    : snapshot.mode === 'completed'
      ? 'Закрыть хвосты после вечера'
      : 'Подготовить заранее';

  return <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
    <div className="flex items-start justify-between gap-3">
      <div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-accent">Задачи вечера</div><h3 className="mt-0.5 text-[14px] font-black text-text-primary">{heading}</h3><p className="mt-1 text-[8px] leading-4 text-text-muted">Шаблонные и ручные задачи остаются привязаны к этому вечеру, пока ты их не закроешь.</p></div>
      <button type="button" onClick={() => { setManualStage(activeStage); setManualOpen(true); }} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[10px] bg-accent px-2.5 text-[9px] font-black text-white"><Plus className="h-3.5 w-3.5" /> Своя</button>
    </div>

    {error ? <div className="mt-3 rounded-[11px] bg-danger-soft px-3 py-2 text-[9px] text-danger">{error}</div> : null}

    {usefulTemplates.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {usefulTemplates.map((template) => {
        const exists = tasks.some((task) => String(task.automation_key || '').endsWith(`:${template.id}`));
        return <button key={template.id} type="button" disabled={Boolean(busy) || exists} onClick={() => void addTemplate(template.id)} className="min-h-10 min-w-[142px] rounded-[11px] border border-border-soft bg-surface-2 px-3 text-left disabled:opacity-45"><div className="flex items-center gap-1 text-[8px] font-black text-accent"><Sparkles className="h-3 w-3" />{stageLabel[template.stage]}</div><div className="mt-0.5 truncate text-[9px] font-bold text-text-primary">{exists ? '✓ ' : ''}{template.title}</div></button>;
      })}
    </div> : null}

    {tasks.length ? <div className="mt-3 space-y-1.5">{tasks.map((task) => <div key={task.id} className="flex items-center gap-2 rounded-[12px] bg-surface-2 px-2.5 py-2.5"><span className="min-w-0 flex-1"><span className="text-[7px] font-black uppercase tracking-wide text-text-muted">{stageLabel[taskStage(task)]}</span><strong className="mt-0.5 block truncate text-[9px] text-text-primary">{task.title}</strong>{task.description ? <span className="mt-0.5 block truncate text-[7px] text-text-muted">{task.description}</span> : null}</span><button type="button" disabled={Boolean(busy)} onClick={() => void snooze(task)} title="Отложить на 30 минут" className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-surface-1 text-text-muted disabled:opacity-40"><Clock3 className="h-3.5 w-3.5" /></button><button type="button" disabled={Boolean(busy)} onClick={() => void complete(task)} title="Выполнено" className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-success-soft text-success disabled:opacity-40"><Check className="h-3.5 w-3.5" /></button></div>)}</div> : <div className="mt-3 rounded-[12px] border border-dashed border-border-soft p-4 text-center"><RotateCcw className="mx-auto h-4 w-4 text-text-muted" /><div className="mt-1 text-[9px] font-bold text-text-primary">Пока нет задач на этот вечер</div><div className="mt-0.5 text-[8px] text-text-muted">Добавь шаблон выше или создай свою.</div></div>}

    <MobileSheet open={manualOpen} title="Задача вечера" onClose={() => !busy && setManualOpen(false)}>
      <div className="space-y-3">
        <label className="block text-[10px] font-black uppercase text-text-muted">Что сделать<input autoFocus value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} maxLength={180} placeholder="Например: рассказать про новый формат" className="mt-1 min-h-11 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[12px] text-text-primary outline-none" /></label>
        <label className="block text-[10px] font-black uppercase text-text-muted">Этап<select value={manualStage} onChange={(event) => setManualStage(event.target.value as Stage)} className="mt-1 min-h-11 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[12px] text-text-primary"><option value="preparation">До вечера</option><option value="during">Во время вечера</option><option value="after">После вечера</option></select></label>
        <label className="block text-[10px] font-black uppercase text-text-muted">Комментарий<textarea value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} rows={3} placeholder="Необязательно" className="mt-1 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 py-2.5 text-[12px] text-text-primary outline-none" /></label>
        <button type="button" disabled={!manualTitle.trim() || Boolean(busy)} onClick={() => void addManual()} className="min-h-11 w-full rounded-[12px] bg-accent text-[11px] font-black text-white disabled:opacity-40">{busy === 'manual' ? 'Добавляем…' : 'Добавить задачу'}</button>
      </div>
    </MobileSheet>
  </section>;
}
