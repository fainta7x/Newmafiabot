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
    <section data-testid="tournament-table-visibility" className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5">
      <div className="flex items-start gap-2.5">
        {hidden ? <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-warning" /> : <Eye className="mt-0.5 h-5 w-5 shrink-0 text-success" />}
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-text-primary">{hidden ? 'Таблица закрыта для игроков' : 'Таблица открыта для игроков'}</div>
          <p className="mt-0.5 text-[12px] leading-4 text-text-secondary">
            {hidden ? 'Игроки не видят таблицу и номинации. Состав и игры видны.' : 'Игроки видят таблицу и номинации в приложении. Перед последними играми её можно закрыть.'}
          </p>
        </div>
      </div>
      <button type="button" disabled={busy} onClick={() => void toggle()} data-testid="tournament-table-toggle"
        className={`mt-3 min-h-11 w-full rounded-xl px-3 text-[14px] font-bold disabled:opacity-40 ${hidden ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
        {busy ? 'Сохраняем…' : hidden ? 'Открыть таблицу игрокам' : 'Закрыть таблицу для игроков'}
      </button>
      {error ? <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p> : null}
    </section>
  );
}
