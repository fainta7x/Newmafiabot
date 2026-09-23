import React, { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { api } from '../../lib/api.ts';

type HeaderEvening = { title: string; starts_at: string; venue?: string | null; status: string; settled_at?: string | null };

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Черновик', className: 'bg-surface-2 text-text-secondary' },
  published: { label: 'Опубликован', className: 'bg-accent-soft text-accent' },
  active: { label: 'Идёт', className: 'bg-success-soft text-success' },
  completed: { label: 'Завершён', className: 'bg-surface-2 text-text-secondary' },
  cancelled: { label: 'Отменён', className: 'bg-danger-soft text-danger' },
};

/** The one evening header shared by every evening tab: back, when/where and status. */
export const EveningHeaderBar: React.FC<{ eveningId: string; refreshKey?: number; onBack: () => void }> = ({ eveningId, refreshKey = 0, onBack }) => {
  const [evening, setEvening] = useState<HeaderEvening | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getEvening(eveningId)
      .then((data) => { if (!cancelled) setEvening(data as HeaderEvening); })
      .catch(() => { if (!cancelled) setEvening(null); });
    return () => { cancelled = true; };
  }, [eveningId, refreshKey]);

  const when = evening ? new Date(evening.starts_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : null;
  const status = evening ? STATUS[evening.status] || STATUS.draft : null;

  return (
    <div className="flex min-h-11 items-center gap-2" data-testid="evening-header-bar">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-[12px] pr-2 text-[12px] font-bold text-text-muted" aria-label="Назад к событиям">
        <ChevronLeft className="h-4 w-4" />События
      </button>
      <p className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">{[when, evening?.venue].filter(Boolean).join(' · ')}</p>
      {status ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${status.className}`}>{status.label}</span> : null}
    </div>
  );
};

export default EveningHeaderBar;
