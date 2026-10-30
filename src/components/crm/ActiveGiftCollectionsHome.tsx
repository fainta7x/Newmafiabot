import { useCallback, useEffect, useState } from 'react';
import { Gift, ArrowRight, RefreshCw } from 'lucide-react';
import { getJson } from '../../lib/requestJson.ts';

type Collection = { id: string; honoree_nickname: string; status: string };
type Detail = { contributions: Array<{ status: string; pledged_amount: number; paid_amount: number }> };
const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

/** Small actionable list for the CRM Today screen. No player-facing totals. */
export default function ActiveGiftCollectionsHome() {
  const [items, setItems] = useState<Array<Collection & { pending: number; pledged: number; paid: number }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const rows = await getJson<Collection[]>('/api/gift-collections', 'Не удалось загрузить сборы');
      const open = rows.filter(row => row.status === 'open');
      const details = await Promise.all(open.map(async row => {
        const detail = await getJson<Detail>(`/api/gift-collections/${encodeURIComponent(row.id)}`, 'Не удалось загрузить сбор');
        return { ...row, pending: detail.contributions.filter(c => c.status === 'invited').length,
          pledged: detail.contributions.filter(c => c.status === 'pledged').reduce((s,c) => s + Number(c.pledged_amount || 0), 0),
          paid: detail.contributions.reduce((s,c) => s + Number(c.paid_amount || 0), 0) };
      }));
      setItems(details); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить сборы'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!loading && items.length === 0 && !error) return null;
  return <section data-testid="crm-active-gift-collections" className="rounded-[18px] border border-border-soft bg-surface-1 p-3">
    <div className="flex items-center gap-2">
      <Gift className="h-5 w-5 text-accent" />
      <h3 className="flex-1 text-[15px] font-bold text-text-primary">Активные сборы на подарки</h3>
      <button type="button" onClick={() => void load()} aria-label="Обновить сборы" className="grid h-10 w-10 place-items-center rounded-xl border border-border-soft"><RefreshCw className="h-4 w-4" /></button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    <div className="mt-2 space-y-2">
      {items.map(item => <a key={item.id} href={`/admin/more/gifts?collection=${encodeURIComponent(item.id)}`}
        className="flex min-h-16 items-center gap-3 rounded-xl bg-surface-2 p-3">
        <div className="min-w-0 flex-1"><strong className="block truncate text-sm text-text-primary">Подарок: {item.honoree_nickname}</strong>
          <p className="mt-1 text-xs text-text-secondary">Получено {rub(item.paid)} · обещано {rub(item.pledged)} · ждём ответа: {item.pending}</p></div>
        <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
      </a>)}
      {loading && <p className="text-xs text-text-secondary">Загружаем сборы…</p>}
    </div>
  </section>;
}
