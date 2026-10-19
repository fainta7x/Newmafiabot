import { useState } from 'react';
import { Clock3, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { formatRubleAmount as money } from '../../lib/formatRubleAmount.ts';

export type EveningExtension = { id: string; games_count: number; amount: number; note?: string | null };

/**
 * «Продлить вечер» (owner, 2026-10-12): the organizer enters how many games the extension covered and the amount the club paid for it.
 * The amount is split between the players of those last games (not the organizer and the judge) and charged at once (owner, 2026-10-19),
 * as a separate line inside the player's single payment.
 */
export default function EveningExtensionBlock({
  eveningId,
  extensions,
  onChanged,
}: {
  eveningId: string;
  extensions: EveningExtension[];
  /** Not needed any more: the charge no longer waits for closing; kept so existing callers still compile. */
  closed?: boolean;
  onChanged: (payload: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [games, setGames] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EveningExtension | null>(null);

  const call = async (url: string, init: RequestInit, fallback: string) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, { credentials: 'include', ...init });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || fallback);
      onChanged(body);
      return true;
    } catch (callError: any) {
      setError(callError?.message || fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const ok = await call(
      `/api/evenings/${encodeURIComponent(eveningId)}/extensions`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ games_count: Number(games), amount: Number(amount) }) },
      'Не удалось добавить продление',
    );
    if (ok) { setOpen(false); setGames(''); setAmount(''); }
  };

  const remove = async (extension: EveningExtension) => {
    await call(`/api/evenings/${encodeURIComponent(eveningId)}/extensions/${encodeURIComponent(extension.id)}`, { method: 'DELETE' }, 'Не удалось убрать продление');
    setRemoveTarget(null);
  };

  const valid = Number.isInteger(Number(games)) && Number(games) >= 1 && Number.isInteger(Number(amount)) && Number(amount) >= 1;

  return (
    <div className="mt-3 rounded-[12px] bg-surface-2 p-2.5" data-testid="evening-extension-block">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-[12px] font-bold text-text-primary">Продление вечера</div>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} data-testid="extension-open" className="inline-flex min-h-[44px] items-center rounded-[9px] bg-surface-1 px-3 text-[11px] font-black text-text-secondary">
          {open ? 'Закрыть' : 'Продлить вечер'}
        </button>
      </div>

      {extensions.length ? (
        <ul className="mt-2 space-y-1.5">
          {extensions.map((extension) => (
            <li key={extension.id} data-testid={`extension-row-${extension.id}`} className="flex min-h-[44px] items-center gap-2 rounded-[10px] bg-surface-1 px-2.5">
              <span className="min-w-0 flex-1 text-[11px] text-text-primary">
                <strong>{money(extension.amount)}</strong> · игр в продлении: {extension.games_count}
                {extension.note ? <span className="block truncate text-[10px] text-text-muted">{extension.note}</span> : null}
              </span>
              <button type="button" onClick={() => setRemoveTarget(extension)} disabled={busy} aria-label={`Убрать продление ${money(extension.amount)}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-text-muted disabled:opacity-40">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="mt-2 space-y-2" data-testid="extension-form">
          <label className="block text-[11px] text-text-secondary">Сколько игр было в продлении
            <input type="number" inputMode="numeric" min={1} step={1} value={games} onChange={(event) => setGames(event.target.value)} data-testid="extension-games" className="mt-1 h-11 w-full rounded-[10px] border border-border-soft bg-surface-1 px-3 text-[14px] text-text-primary" />
          </label>
          <label className="block text-[11px] text-text-secondary">Какая сумма, ₽
            <input type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} data-testid="extension-amount" className="mt-1 h-11 w-full rounded-[10px] border border-border-soft bg-surface-1 px-3 text-[14px] text-text-primary" />
          </label>
          <p className="text-[10px] leading-4 text-text-muted">
            Сумма делится поровну между игроками этих последних игр, без организатора и судьи, и округляется вниз до рубля.
            {' Начисление появится у игроков сразу и привязано к уже сыгранным играм: игры после этого его не сдвигают.'}
          </p>
          {error ? <div role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[10px] text-danger">{error}</div> : null}
          <button type="button" onClick={() => void submit()} disabled={busy || !valid} data-testid="extension-submit" className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[11px] bg-success-soft px-3 text-[12px] font-black text-success disabled:opacity-40">
            Начислить продление
          </button>
        </div>
      ) : error ? <div role="alert" className="mt-2 rounded-[10px] bg-danger-soft px-3 py-2 text-[10px] text-danger">{error}</div> : null}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Убрать продление?"
        description={removeTarget ? `Начисления за продление ${money(removeTarget.amount)} у игроков исчезнут (если вечер закрыт, это будет обычная корректировка в учёте).` : undefined}
        confirmLabel="Убрать"
        busy={busy}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => { if (removeTarget) void remove(removeTarget); }}
      />
    </div>
  );
}
