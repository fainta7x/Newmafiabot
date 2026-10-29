import { useCallback, useEffect, useState } from 'react';
import { getJson, sendJson } from '../../lib/requestJson.ts';
import { formatRubles } from '../../lib/formatRubleAmount.ts';

type DebtEvening = { evening_id: string; title: string; starts_at: string; owed: number };
type Debtor = { player_id: string; nickname: string; owed: number; evenings: DebtEvening[] };

const date = (value: string) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const FIRST = 5;

/**
 * «Долги игроков» on the Today screen (owner, 2026-10-29): every player who still owes, one row each with the total across
 * all evenings and the evenings behind it; «Оплачено» per evening and one button for everything the player owes.
 */
export default function OrganizerDebtsPanel({ enabled, refreshKey, onOpenPlayer, onChanged, onCount }: {
  enabled: boolean;
  refreshKey: number;
  onOpenPlayer: (playerId: string) => void;
  onChanged: () => void;
  onCount?: (count: number) => void;
}) {
  const [debtors, setDebtors] = useState<Debtor[] | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const body = await getJson<{ debtors?: Debtor[] }>('/api/crm/debts', 'Не удалось загрузить долги', { cache: 'no-store' });
      const rows = Array.isArray(body?.debtors) ? body.debtors : [];
      setDebtors(rows); setError(''); onCount?.(rows.length);
    } catch (e: any) { setError(e?.message || 'Не удалось загрузить долги'); }
  }, [onCount]);
  // Old amounts never show while payments are being refreshed (the Today screen hides every amount until the read is fresh).
  useEffect(() => { if (enabled) void load(); else { setDebtors(null); onCount?.(0); } }, [enabled, refreshKey, load, onCount]);

  const pay = async (debtor: Debtor, eveningId: string | null) => {
    if (busy) return;
    setBusy(`${debtor.player_id}:${eveningId || 'all'}`); setError(''); setNotice('');
    try {
      await sendJson(`/api/crm/debts/${encodeURIComponent(debtor.player_id)}/paid`, 'POST', eveningId ? { evening_id: eveningId } : {}, 'Не удалось отметить оплату');
      await load(); onChanged();
    } catch (e: any) { setError(e?.message || 'Не удалось отметить оплату'); } finally { setBusy(''); }
  };
  const remind = async () => {
    if (busy) return;
    setBusy('remind'); setError(''); setNotice('');
    try {
      const r = await sendJson<{ queued: number; skipped_recent: number; undeliverable: number }>('/api/crm/debts/remind', 'POST', {}, 'Не удалось отправить напоминания');
      setNotice(`Напоминания отправлены: ${r.queued}. Уже напоминали недавно: ${r.skipped_recent}. Без канала связи: ${r.undeliverable}.`);
    } catch (e: any) { setError(e?.message || 'Не удалось отправить напоминания'); } finally { setBusy(''); }
  };

  if (!enabled || !debtors?.length) return error && enabled ? <p role="alert" className="rounded-[14px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null;
  const total = debtors.reduce((sum, d) => sum + d.owed, 0);
  const shown = all ? debtors : debtors.slice(0, FIRST);
  return (
    <section data-testid="debts-panel" className="rounded-[18px] border border-warning/20 bg-warning-soft/40 p-3">
      <div className="text-[12px] font-semibold text-warning">Долги игроков · {debtors.length} чел. · {formatRubles(total)}</div>
      <p className="mt-0.5 text-[12px] leading-4 text-text-muted">За завершённые вечера. «Оплачено» — когда перевод получен; у кого несколько вечеров, можно отметить каждый или всё сразу.</p>
      <div className="mt-2 space-y-1.5">
        {shown.map((debtor) => (
          <div key={debtor.player_id} data-testid="debt-row" className="rounded-[10px] bg-surface-1 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onOpenPlayer(debtor.player_id)} className="min-w-0 flex-1 text-left"><strong className="block truncate text-[13px] text-text-primary">{debtor.nickname}</strong></button>
              <span className="shrink-0 text-[13px] font-bold text-text-primary">{formatRubles(debtor.owed)}</span>
            </div>
            {debtor.evenings.map((evening) => (
              <div key={evening.evening_id} className="mt-1 flex min-h-11 items-center gap-2">
                <span className="min-w-0 flex-1 text-[12px] text-text-muted">{evening.title.includes(date(evening.starts_at)) ? evening.title : `${evening.title} · ${date(evening.starts_at)}`} — {formatRubles(evening.owed)}</span>
                <button type="button" disabled={Boolean(busy)} onClick={() => void pay(debtor, evening.evening_id)} className="min-h-11 shrink-0 rounded-[9px] bg-success-soft px-3 text-[13px] font-bold text-success disabled:opacity-40">{busy === `${debtor.player_id}:${evening.evening_id}` ? '…' : 'Оплачено'}</button>
              </div>
            ))}
            {debtor.evenings.length > 1 ? <button type="button" disabled={Boolean(busy)} onClick={() => void pay(debtor, null)} className="mt-1 min-h-11 w-full rounded-[9px] border border-success/30 text-[13px] font-bold text-success disabled:opacity-40">{busy === `${debtor.player_id}:all` ? '…' : `Оплачено всё · ${formatRubles(debtor.owed)}`}</button> : null}
          </div>
        ))}
      </div>
      {debtors.length > FIRST ? <button type="button" onClick={() => setAll((value) => !value)} className="mt-2 min-h-11 w-full rounded-[10px] border border-border-soft text-[13px] font-semibold text-text-secondary">{all ? 'Свернуть' : `Показать всех (${debtors.length})`}</button> : null}
      <button type="button" disabled={Boolean(busy)} onClick={() => void remind()} className="mt-2 min-h-11 w-full rounded-[10px] border border-border-soft text-[13px] font-semibold text-text-primary disabled:opacity-40">{busy === 'remind' ? 'Отправляем…' : 'Напомнить всем должникам'}</button>
      {notice ? <p role="status" className="mt-2 text-[12px] text-text-secondary">{notice}</p> : null}
      {error ? <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p> : null}
    </section>
  );
}
