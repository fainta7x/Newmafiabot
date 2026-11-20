import { useEffect, useState } from 'react';
import { appConfirm } from '../../lib/appConfirm.ts';
import { curseLabel } from '../../shared/playerCurse.ts';

/** «Проклятье на понос» in the CRM player card (owner, 2026-11-19): only the organizer lifts it before it ends. */
export default function PlayerCurseCard({ playerId, nickname }: { playerId: string; nickname: string }) {
  const [until, setUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/crm/curses?player_id=${encodeURIComponent(playerId)}`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null)).then((body) => { if (!cancelled) setUntil(body?.until || null); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [playerId]);
  if (!until) return null;
  const lift = async () => {
    if (busy || !(await appConfirm(`Снять «Проклятье на понос» с ${nickname}? Все его отметки «проигнорировал бота» перестанут считаться.`, { title: 'Снять проклятье?', confirmLabel: 'Снять' }))) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/crm/curses/lift', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_id: playerId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось снять');
      setUntil(body?.until || null);
    } catch (err: any) { setError(err?.message || 'Не удалось снять'); } finally { setBusy(false); }
  };
  return <section data-testid="crm-player-curse" className="space-y-2 rounded-[17px] border border-lime-300/25 bg-lime-400/[0.07] p-3.5">
    <p className="text-[13px] font-semibold text-text-primary">{curseLabel(until)}</p>
    <button type="button" disabled={busy} onClick={() => void lift()} data-testid="crm-player-curse-lift" className="min-h-11 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[13px] font-semibold text-text-primary disabled:opacity-40">Снять проклятье</button>
    {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
  </section>;
}
