import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { countGames } from '../../lib/russianPlural';

type CloseoutSummary = { games: { total: number; completed: number; unfinished: unknown[] } };

/**
 * The evening's next step, shown only when there is one to take: once every
 * game of a running evening is finished, point the organizer to closing it.
 */
export const EveningNextStepBanner: React.FC<{ eveningId: string; status: string | null; refreshKey?: number; onOpenCloseout: () => void }> = ({ eveningId, status, refreshKey = 0, onOpenCloseout }) => {
  const [summary, setSummary] = useState<CloseoutSummary | null>(null);

  useEffect(() => {
    setSummary(null);
    if (status !== 'active') return;
    let cancelled = false;
    fetch(`/api/evenings/${encodeURIComponent(eveningId)}/closeout`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (!cancelled && body?.games) setSummary(body as CloseoutSummary); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [eveningId, status, refreshKey]);

  if (status !== 'active' || !summary || summary.games.total === 0 || summary.games.unfinished.length > 0) return null;

  return (
    <button type="button" onClick={onOpenCloseout} data-testid="evening-next-step-close" className="flex min-h-14 w-full items-center gap-3 rounded-[14px] border border-success/30 bg-success-soft px-3 text-left">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
      <span className="min-w-0 flex-1">
        <strong className="block text-[14px] text-text-primary">Все игры сыграны</strong>
        <span className="block text-[12px] text-text-secondary">{countGames(summary.games.completed)} · проверь явку и оплаты и закрой вечер</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold text-success">Закрыть <ArrowRight className="h-4 w-4" /></span>
    </button>
  );
};

export default EveningNextStepBanner;
