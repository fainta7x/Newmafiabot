import { useCallback, useEffect, useState } from 'react';

export type PlayerProfileCompletenessData = {
  percentage: number;
  complete: boolean;
  missing_fields: string[];
  important_missing_fields: string[];
  next_missing_field: string | null;
  fields: Record<string, { label: string; weight: number; complete: boolean; state: string }>;
  updated_at: string | null;
  checked_at: string | null;
};

const eventName = 'player-profile-completeness-refresh';
export const requestPlayerProfileCompletenessRefresh = () => window.dispatchEvent(new Event(eventName));

export function usePlayerProfileCompleteness() {
  const [data, setData] = useState<PlayerProfileCompletenessData | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/player/profile-completeness', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.completeness) setData(body.completeness);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const listener = () => void refresh();
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, [refresh]);
  return { data, loading, refresh };
}

export function PlayerProfileCompletionCard({ compact = false }: { compact?: boolean }) {
  const { data, loading } = usePlayerProfileCompleteness();
  if (loading && !data) return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/45">Проверяем профиль…</div>;
  if (!data) return null;
  const next = data.next_missing_field ? data.fields[data.next_missing_field] : null;
  return (
    <section data-testid="profile-completion-card" className={`rounded-[24px] border ${data.complete ? 'border-emerald-400/20 bg-emerald-400/[0.07]' : 'border-amber-300/20 bg-amber-300/[0.07]'} ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Профиль заполнен на {data.percentage}%</div>
          {next ? <p className="mt-1 text-sm leading-5 text-white/60">Следующий шаг: {next.label.toLowerCase()}</p> : <p className="mt-1 text-sm text-white/60">Основные данные заполнены.</p>}
        </div>
        <strong className="shrink-0 text-xl tabular-nums text-white">{data.percentage}%</strong>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${data.percentage}%` }} /></div>
      {!compact && data.missing_fields.length ? <div className="mt-3 flex flex-wrap gap-1.5">{data.missing_fields.map((key) => <span key={key} className="rounded-full bg-black/20 px-2.5 py-1 text-xs text-white/60">{data.fields[key]?.label || key}</span>)}</div> : null}
    </section>
  );
}

export function PlayerProfileReminder({ playerId, onOpenProfile }: { playerId: string; onOpenProfile: () => void }) {
  const { data } = usePlayerProfileCompleteness();
  const storageKey = `profile-completeness-dismissed:${playerId}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === '1'; } catch { return false; }
  });
  useEffect(() => {
    if (data?.complete) {
      try { sessionStorage.removeItem(storageKey); } catch {}
      setDismissed(false);
    }
  }, [data?.complete, storageKey]);
  if (!data || data.complete || dismissed) return null;
  const next = data.next_missing_field ? data.fields[data.next_missing_field] : null;
  return (
    <aside data-testid="profile-completion-reminder" className="mx-auto mt-2 w-[calc(100%-24px)] max-w-[430px] rounded-[20px] border border-amber-300/25 bg-[#252013] p-3 text-white shadow-lg">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Заполни профиль · {data.percentage}%</div>
          <p className="mt-1 text-sm leading-5 text-white/65">{next ? `Следующее: ${next.label.toLowerCase()}.` : 'Осталось несколько полей.'} Это не мешает пользоваться приложением.</p>
        </div>
        <button type="button" aria-label="Скрыть напоминание до следующего визита" onClick={() => { try { sessionStorage.setItem(storageKey, '1'); } catch {} setDismissed(true); }} className="min-h-11 min-w-11 rounded-xl text-xl text-white/55">×</button>
      </div>
      <button type="button" onClick={onOpenProfile} className="mt-3 min-h-11 w-full rounded-xl bg-white px-4 text-sm font-semibold text-black">Заполнить профиль</button>
    </aside>
  );
}
