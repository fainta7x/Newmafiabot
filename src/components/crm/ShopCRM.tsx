import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Wallet } from 'lucide-react';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { TokenIcon } from '../ui/TokenIcon.tsx';
import { SECTION_PLAYER_HANDOFF, openCrmSection } from '../../lib/crmSectionNavigation.ts';
import { formatMoscowDate } from '../../lib/moscowDate.ts';

type Item = { id: string; name: string; description: string; price: number; icon: string; item_type: string; active: number; sold_count: number; waiting_count: number; sellable: boolean; standalone: boolean };
type TypeOption = { value: string; label: string; delivery: string };
type Purchase = { id: string; player_id: string; nickname: string | null; item_name_snapshot: string; item_type_snapshot: string; price_snapshot: number; status: string; purchased_at: string; redeemed_at: string | null };
type Draft = { id?: string; name: string; description: string; price: string; icon: string; item_type: string; active: boolean };
const EMPTY: Draft = { name: '', description: '', price: '', icon: '🛍️', item_type: 'manual', active: true };

const request = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Ошибка запроса');
  return body as T;
};
const tokens = (value: number) => Math.trunc(Number(value || 0)).toLocaleString('ru-RU');
const statusText = (purchase: Purchase) => purchase.status === 'redeemed' ? 'выдано' : purchase.item_type_snapshot === 'free_evening' ? 'ждёт использования игроком' : 'ждёт выдачи';

/**
 * «Магазин» (owner, 2026-11-11): the products sold for tokens and who bought what, in one place of its own (it was a tab of the
 * expert-edit screen). A product is sold only if buying it delivers something: a free evening the player spends himself, or a thing
 * the organizer hands out by hand and ticks here.
 */
export default function ShopCRM() {
  const [items, setItems] = useState<Item[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [tab, setTab] = useState<'items' | 'purchases'>('items');
  const [status, setStatus] = useState<'all' | 'purchased' | 'redeemed'>('all');
  const [playerId, setPlayerId] = useState(() => {
    const key = SECTION_PLAYER_HANDOFF.shop!;
    try { const id = sessionStorage.getItem(key) || ''; sessionStorage.removeItem(key); return id; } catch { return ''; }
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [shop, bought] = await Promise.all([
        request<{ items: Item[]; types: TypeOption[] }>('/api/admin-data/shop'),
        request<{ purchases: Purchase[] }>('/api/admin-data/shop/purchases'),
      ]);
      setItems(shop.items || []); setTypes(shop.types || []); setPurchases(bought.purchases || []); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось загрузить магазин'); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (playerId) setTab('purchases'); }, [playerId]);

  const shown = useMemo(() => purchases.filter((purchase) => (!playerId || purchase.player_id === playerId) && (status === 'all' || purchase.status === status)), [purchases, playerId, status]);
  const waiting = purchases.filter((purchase) => purchase.status === 'purchased' && purchase.item_type_snapshot !== 'free_evening').length;
  const playerName = playerId ? purchases.find((purchase) => purchase.player_id === playerId)?.nickname || 'игрок' : '';

  const save = async () => {
    if (!draft) return;
    setSaving(true); setError('');
    try {
      const body = { name: draft.name, description: draft.description, price: Number(draft.price || 0), icon: draft.icon, item_type: draft.item_type, active: draft.active };
      if (draft.id) await request(`/api/admin-data/shop-items/${encodeURIComponent(draft.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await request('/api/admin-data/shop-items', { method: 'POST', body: JSON.stringify(body) });
      setDraft(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить'); }
    finally { setSaving(false); }
  };
  const issue = async (id: string) => {
    try { await request(`/api/admin-data/shop/purchases/${encodeURIComponent(id)}/issued`, { method: 'POST' }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось отметить'); }
  };

  const field = 'mobile-field mt-1 min-h-11 w-full';
  return <div data-testid="crm-shop" className="mx-auto w-full max-w-2xl space-y-3">
    <p className="px-1 text-[13px] leading-5 text-text-secondary">Товары за жетоны и кто что купил. Роль и музыку игрок выбирает за рубли или за жетоны при покупке перед игрой — здесь цена в жетонах. Бесплатный вечер игрок тратит сам, остальное вы выдаёте и отмечаете «Выдано».</p>
    {error && <div role="alert" className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div>}
    <div className="grid grid-cols-2 gap-1 rounded-[14px] border border-border-soft bg-surface-1 p-1">
      {([['items', 'Товары'], ['purchases', waiting ? `Покупки · ждут выдачи: ${waiting}` : 'Покупки']] as const).map(([id, label]) =>
        <button key={id} type="button" onClick={() => setTab(id)} className={`min-h-11 rounded-[10px] px-2 text-[12px] font-bold ${tab === id ? 'bg-accent text-white' : 'text-text-secondary'}`}>{label}</button>)}
    </div>

    {!loaded ? <div className="flex min-h-[30vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-accent" /></div> : tab === 'items' ? <div className="space-y-2">
      <button type="button" data-testid="crm-shop-add" onClick={() => setDraft({ ...EMPTY })} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-border-soft bg-surface-1 text-[13px] font-bold text-accent"><Plus className="h-4 w-4" />Добавить товар</button>
      {items.map((item) => <button key={item.id} type="button" data-testid={`crm-shop-item-${item.id}`} onClick={() => setDraft({ id: item.id, name: item.name, description: item.description, price: String(item.price), icon: item.icon, item_type: item.item_type, active: Boolean(item.active) })}
        className="flex w-full items-start gap-3 rounded-[16px] border border-border-soft bg-surface-1 p-3 text-left">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-2xl">{item.icon}</span>
        <span className="min-w-0 flex-1">
          <strong className="block break-words text-[14px] text-text-primary">{item.name}</strong>
          <span className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-text-secondary">{tokens(item.price)} <TokenIcon /></span>
          <span className="mt-1 block text-[11px] leading-4 text-text-muted">
            {!item.sellable ? 'Не продаётся: этот товар ничего не выдаёт. Выберите, что получает игрок.' : !item.standalone ? (item.active ? 'Цена оплаты жетонами в «Покупках перед игрой»' : 'Оплата жетонами выключена') : !item.active ? 'Скрыт от игроков' : 'В продаже'}
            {item.sold_count ? ` · куплено ${item.sold_count}` : ''}{item.waiting_count && item.item_type === 'manual' ? ` · ждут выдачи ${item.waiting_count}` : ''}
          </span>
        </span>
      </button>)}
    </div> : <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'purchased', 'redeemed'] as const).map((id) => <button key={id} type="button" onClick={() => setStatus(id)} className={`min-h-11 rounded-xl border px-3 text-[12px] font-bold ${status === id ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-1 text-text-secondary'}`}>{id === 'all' ? 'Все' : id === 'purchased' ? 'Ждут' : 'Выданы'}</button>)}
        {playerId && <button type="button" onClick={() => setPlayerId('')} className="min-h-11 rounded-xl border border-border-soft bg-surface-1 px-3 text-[12px] font-bold text-text-primary">Игрок: {playerName} ✕</button>}
      </div>
      {shown.length === 0 ? <p className="rounded-[14px] border border-border-soft bg-surface-1 p-4 text-[13px] text-text-secondary">Покупок пока нет.</p> : shown.map((purchase) => <div key={purchase.id} className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><strong className="block break-words text-[14px] text-text-primary">{purchase.item_name_snapshot}</strong>
            <span className="mt-0.5 block text-[12px] text-text-secondary">{purchase.nickname || 'Игрок'} · {formatMoscowDate(purchase.purchased_at, 'short-time', { empty: '', invalidAsRaw: true })}</span></div>
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-text-primary">−{tokens(purchase.price_snapshot)} <TokenIcon /></span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${purchase.status === 'redeemed' ? 'bg-surface-2 text-text-secondary' : 'bg-accent/15 text-accent'}`}>{statusText(purchase)}</span>
          {purchase.status === 'purchased' && ['manual', 'custom'].includes(purchase.item_type_snapshot) && <button type="button" onClick={() => void issue(purchase.id)} className="min-h-11 rounded-xl bg-accent px-3 text-[12px] font-bold text-white">Выдано</button>}
          <button type="button" onClick={() => openCrmSection('tokens', purchase.player_id)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border-soft px-3 text-[12px] font-bold text-text-primary"><Wallet className="h-4 w-4" />Жетоны игрока</button>
        </div>
      </div>)}
    </div>}

    <MobileSheet open={Boolean(draft)} title={draft?.id ? 'Товар' : 'Новый товар'} onClose={() => setDraft(null)}
      footer={<button type="button" disabled={saving || !draft?.name.trim() || !draft?.description.trim()} onClick={() => void save()} className="min-h-11 w-full rounded-[12px] bg-accent text-[13px] font-bold text-white disabled:opacity-40">{saving ? 'Сохраняем…' : 'Сохранить товар'}</button>}>
      {draft && <div className="space-y-3">
        <label className="block text-[12px] text-text-secondary">Название<input className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="block text-[12px] text-text-secondary">Описание для игрока<textarea className={`${field} min-h-24`} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        <div className="grid grid-cols-[1fr_88px] gap-3">
          <label className="block text-[12px] text-text-secondary">Цена в жетонах<input type="number" min={0} step={1} className={field} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
          <label className="block text-[12px] text-text-secondary">Значок<input className={field} value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} /></label>
        </div>
        <label className="block text-[12px] text-text-secondary">Что получает игрок
          <select className={field} value={draft.item_type} onChange={(e) => setDraft({ ...draft, item_type: e.target.value })}>
            {!types.some((type) => type.value === draft.item_type) && <option value={draft.item_type} disabled>Ничего не выдаёт — выберите другое</option>}
            {types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <span className="mt-1 block text-[11px] leading-4 text-text-muted">{types.find((type) => type.value === draft.item_type)?.delivery || 'Пока не выбрано, товар не продаётся.'}</span>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[13px] text-text-primary"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />В продаже</label>
        {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      </div>}
    </MobileSheet>
  </div>;
}
