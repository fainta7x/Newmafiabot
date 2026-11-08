import { useState } from 'react';
import { EyeOff, Eye } from 'lucide-react';

/**
 * «Закрытие таблицы» (owner, 2026-10-06): players follow the table and nominations live; before the last games the organizer
 * closes them so the intrigue stays, and opens them again for the final.
 */
export function TournamentTableVisibilityCard({ tournamentId, hidden, onChanged }: { tournamentId: string; hidden: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/standings-hidden`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: !hidden }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || 'Не удалось изменить');
      onChanged();
    } catch (reason: any) {
      setError(reason?.message || 'Не удалось изменить');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-testid="tournament-table-visibility" className="rounded-[18px] border border-border-soft bg-surface-1 px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        {hidden ? <EyeOff className="h-5 w-5 shrink-0 text-warning" /> : <Eye className="h-5 w-5 shrink-0 text-success" />}
        <div className="min-w-0 flex-1 text-[13px] font-bold leading-4 text-text-primary">{hidden ? 'Таблица закрыта для игроков' : 'Таблица открыта для игроков'}</div>
        <button type="button" disabled={busy} onClick={() => void toggle()} data-testid="tournament-table-toggle"
          className={`min-h-11 shrink-0 rounded-xl px-3 text-[13px] font-bold disabled:opacity-40 ${hidden ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
          {busy ? 'Сохраняем…' : hidden ? 'Открыть' : 'Закрыть'}
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p> : null}
    </section>
  );
}
