import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronRight, Circle, Info, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api.ts';
import type { EveningSection } from './EveningWorkspace.tsx';
import GatheredPostSheet from './GatheredPostSheet.tsx';

type StepStatus = 'done' | 'todo' | 'attention' | 'info';
type Step = {
  id: string;
  title: string;
  detail?: string;
  status: StepStatus;
  target?: EveningSection;
  action?: 'publish' | 'start' | 'create_next' | 'gathered_post';
  task_id?: string;
};
type Stage = { id: string; title: string; hint: string; state: 'done' | 'current' | 'upcoming'; steps: Step[] };
type RoutePayload = { evening: { id: string; status: string }; current_stage: string; stages: Stage[] };

const ACTION_LABELS: Record<NonNullable<Step['action']>, string> = {
  publish: 'Опубликовать',
  start: 'Начать вечер',
  create_next: 'Создать следующую пятницу',
  gathered_post: 'Сделать фото',
};

const StepIcon = ({ status }: { status: StepStatus }) => {
  if (status === 'done') return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success-soft text-success"><Check className="h-3.5 w-3.5" /></span>;
  if (status === 'attention') return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-warning-soft text-warning"><AlertCircle className="h-3.5 w-3.5" /></span>;
  if (status === 'info') return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-text-muted"><Info className="h-3.5 w-3.5" /></span>;
  return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-text-muted"><Circle className="h-3 w-3" /></span>;
};

/**
 * The evening as one route (user-approved 2026-09-24): stages from preparation to «after»,
 * the current one open, each step showing its real state and where to act.
 */
export default function EveningRouteView({ eveningId, refreshKey = 0, onOpenSection, onChanged }: {
  eveningId: string;
  refreshKey?: number;
  onOpenSection: (section: EveningSection) => void;
  onChanged?: () => void;
}) {
  const [route, setRoute] = useState<RoutePayload | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [gatheredOpen, setGatheredOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/route`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить маршрут');
      setRoute(body as RoutePayload);
      setOpen((current) => current ?? (body as RoutePayload).current_stage);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить маршрут');
    }
  }, [eveningId]);

  useEffect(() => { setOpen(null); void load(); }, [load, refreshKey]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  const run = async (step: Step) => {
    if (busy) return;
    if (step.action === 'gathered_post') { setGatheredOpen(true); return; }
    setBusy(step.id);
    setError('');
    try {
      if (step.task_id) {
        await api.updateTask(step.task_id, { status: step.status === 'done' ? 'todo' : 'done' } as any);
      } else if (step.action === 'publish') {
        await api.updateEvening(eveningId, { status: 'published' } as any);
      } else if (step.action === 'start') {
        await api.updateEvening(eveningId, { status: 'active' } as any);
      } else if (step.action === 'create_next') {
        const response = await fetch('/api/evenings/create-next-friday', { method: 'POST', credentials: 'include' });
        if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || 'Не удалось создать вечер');
      }
      onChanged?.();
      await load();
    } catch (runError: any) {
      setError(runError?.message || 'Не удалось выполнить шаг');
    } finally {
      setBusy(null);
    }
  };

  if (!route) {
    return error
      ? <div className="rounded-[16px] bg-danger-soft px-3 py-3 text-[13px] text-danger">{error}</div>
      : <div className="flex min-h-24 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-accent" /></div>;
  }

  return (
    <section className="space-y-2" aria-label="Маршрут вечера" data-testid="evening-route">
      <GatheredPostSheet eveningId={eveningId} open={gatheredOpen} onClose={() => setGatheredOpen(false)} onDone={() => { setGatheredOpen(false); onChanged?.(); void load(); }} />
      {error ? <div className="rounded-[12px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</div> : null}
      {route.stages.map((stage, index) => {
        const expanded = open === stage.id;
        const done = stage.steps.filter((step) => step.status === 'done').length;
        const tone = stage.state === 'current' ? 'border-accent/40 bg-surface-1' : 'border-border-soft bg-surface-1';
        return (
          <div key={stage.id} className={`overflow-hidden rounded-[16px] border ${tone}`} data-testid={`evening-route-stage-${stage.id}`}>
            <button type="button" onClick={() => setOpen(expanded ? null : stage.id)} aria-expanded={expanded} className="flex min-h-[56px] w-full items-center gap-3 px-3 text-left">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-black ${stage.state === 'done' ? 'bg-success-soft text-success' : stage.state === 'current' ? 'bg-accent text-white' : 'bg-surface-2 text-text-muted'}`}>
                {stage.state === 'done' ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <strong className={`block text-[15px] ${stage.state === 'upcoming' ? 'text-text-secondary' : 'text-text-primary'}`}>{stage.title}{stage.state === 'current' ? <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 align-middle text-[11px] font-bold text-accent">сейчас</span> : null}</strong>
                <span className="mt-0.5 block text-[12px] leading-4 text-text-muted">{expanded || stage.state === 'upcoming' ? stage.hint : `${done} из ${stage.steps.length} готово`}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded ? (
              <div className="space-y-1.5 border-t border-border-soft p-2">
                {stage.steps.map((step) => {
                  const clickable = Boolean(step.target) && !step.action && !step.task_id;
                  const body = (
                    <>
                      <StepIcon status={step.status} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[14px] font-semibold ${step.status === 'done' ? 'text-text-secondary' : 'text-text-primary'}`}>{step.title}</span>
                        {step.detail ? <span className="mt-0.5 block text-[12px] leading-4 text-text-muted">{step.detail}</span> : null}
                      </span>
                    </>
                  );
                  if (clickable) {
                    return (
                      <button key={step.id} type="button" onClick={() => onOpenSection(step.target as EveningSection)} className="flex min-h-[52px] w-full items-center gap-2.5 rounded-[12px] bg-surface-2 px-2.5 py-2 text-left active:bg-surface-hover">
                        {body}
                        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                      </button>
                    );
                  }
                  return (
                    <div key={step.id} className="flex min-h-[52px] items-center gap-2.5 rounded-[12px] bg-surface-2 px-2.5 py-2">
                      {body}
                      {step.task_id ? (
                        <button type="button" disabled={busy === step.id} onClick={() => void run(step)} className={`min-h-10 shrink-0 rounded-[10px] px-3 text-[12px] font-bold disabled:opacity-50 ${step.status === 'done' ? 'bg-surface-1 text-text-secondary' : 'bg-success-soft text-success'}`}>
                          {step.status === 'done' ? 'Вернуть' : 'Сделано'}
                        </button>
                      ) : step.action && step.status !== 'done' ? (
                        <button type="button" disabled={busy === step.id} onClick={() => void run(step)} className="min-h-10 shrink-0 rounded-[10px] bg-accent px-3 text-[12px] font-bold text-white disabled:opacity-50">
                          {busy === step.id ? '…' : ACTION_LABELS[step.action]}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
