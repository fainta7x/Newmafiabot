import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../ui/Dialog.tsx';
import { analyticsHelp, type AnalyticsHelpKey } from '../../lib/analyticsHelp.ts';

export const analyticsCard = 'rounded-[var(--ds-radius-xl,24px)] border border-border-soft bg-surface-1 p-4';
export const analyticsInset = 'rounded-xl bg-surface-2 p-3';

/** Keep confirmed data while loading; abort stale requests, including tab changes and retries. */
export function useAnalyticsQuery<T>(url: string, active = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) { setLoading(false); return; }
    const controller = new AbortController();
    let disposed = false;
    setLoading(true); setError('');
    void fetch(url, { credentials: 'include', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить данные.');
        const body = await response.json();
        if (!disposed) setData(body);
      })
      .catch(() => { if (!disposed) setError('Не удалось загрузить данные.'); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; controller.abort(); };
  }, [url, active, revision]);
  return { data, loading, error, retry: () => setRevision(value => value + 1) };
}

export function AnalyticsStatus({ loading, error, retry, data }: { loading: boolean; error: string; retry: () => void; data?: unknown }) {
  return <>
    {loading && <div role="progressbar" aria-label="Обновляем данные" className="my-3 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full w-1/2 animate-pulse bg-accent" /></div>}
    {error && <div role="alert" className="my-3 flex flex-wrap items-center justify-between gap-2 text-xs text-danger"><span>{error}{data ? ' Старые данные не обновлены.' : ''}</span><button type="button" onClick={retry} className="min-h-11 rounded-xl bg-surface-2 px-4 text-text-primary">Повторить</button></div>}
  </>;
}

export function AnalyticsHelp({ name, title }: { name: AnalyticsHelpKey; title: string }) {
  return <Dialog><DialogTrigger aria-label={`Как считаем: ${title}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-2">?</DialogTrigger>
    <DialogContent><DialogTitle className="pr-10">{title}</DialogTitle><DialogDescription className="mt-3 text-sm">{analyticsHelp[name]}</DialogDescription></DialogContent>
  </Dialog>;
}

export function AnalyticsHeading({ title, help, caption }: { title: string; help: AnalyticsHelpKey; caption: string }) {
  return <div className="flex items-start justify-between gap-2"><div><h3 className="text-base font-semibold text-text-primary">{title}</h3><p className="mt-1 text-xs text-text-secondary">{caption}</p></div><AnalyticsHelp name={help} title={title} /></div>;
}
