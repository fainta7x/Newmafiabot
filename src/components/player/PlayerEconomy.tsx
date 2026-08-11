import React, { useEffect, useState } from 'react';

type EconomyScope = 'shop' | 'history';

type ShopItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  item_type: string;
};

type ShopPurchase = {
  id: string;
  item_id: string;
  item_name_snapshot: string;
  item_type_snapshot: string;
  price_snapshot: number;
  status: string;
  purchased_at: string;
  redeemed_at: string | null;
  notes: string | null;
};

type TokenLedgerEntry = {
  id: string;
  amount: number;
  balance_after: number;
  reason_type: string;
  description: string;
  source_type: string;
  source_id: string | null;
  created_at: string;
};

type EconomyData = {
  balance: number;
  shop_items: ShopItem[];
  purchases: ShopPurchase[];
  ledger: {
    items: TokenLedgerEntry[];
    total: number;
  };
};

const formatTokens = (value: number) => Math.trunc(Number(value || 0)).toLocaleString('ru-RU');

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const purchaseStatusLabel = (status: string) => {
  if (status === 'redeemed') return 'использовано';
  if (status === 'cancelled') return 'отменено';
  return 'куплено';
};

const makeRequestId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h2>
      {children}
    </section>
  );
}

export default function PlayerEconomy({ onBalanceChange }: { onBalanceChange?: (balance: number) => void }) {
  const [scope, setScope] = useState<EconomyScope>('shop');
  const [data, setData] = useState<EconomyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ShopItem | null>(null);
  const [buying, setBuying] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await fetch('/api/player/economy', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить жетоны');
      const next = body as EconomyData;
      setData(next);
      setError(null);
      onBalanceChange?.(Number(next.balance || 0));
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить жетоны');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const confirmPurchase = async () => {
    if (!activeItem || buying) return;
    setBuying(true);
    setError(null);
    try {
      const response = await fetch('/api/player/shop/purchase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: activeItem.id, request_id: makeRequestId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось совершить покупку');
      const newBalance = Number(body?.balance || 0);
      setSuccess(`${activeItem.icon} ${activeItem.name} — покупка оформлена`);
      setActiveItem(null);
      onBalanceChange?.(newBalance);
      await load();
    } catch (purchaseError: any) {
      setError(purchaseError?.message || 'Не удалось совершить покупку');
    } finally {
      setBuying(false);
    }
  };

  if (!data && !error) {
    return <Section title="Жетоны и магазин"><p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка кошелька…</p></Section>;
  }

  return (
    <>
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.035] p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-white/35">Кошелёк</div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold text-white">{formatTokens(data?.balance || 0)} 🪙</div>
            <div className="mt-1 text-sm text-white/40">жетонов на балансе</div>
          </div>
          <div className="rounded-2xl bg-black/20 px-3 py-2 text-right">
            <div className="text-sm font-semibold text-white/75">{data?.purchases.length || 0}</div>
            <div className="text-[10px] text-white/35">покупок</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.045] p-1">
        <button type="button" onClick={() => setScope('shop')} className={`min-h-10 rounded-xl px-3 text-sm font-medium ${scope === 'shop' ? 'bg-white text-black' : 'text-white/50'}`}>Магазин</button>
        <button type="button" onClick={() => setScope('history')} className={`min-h-10 rounded-xl px-3 text-sm font-medium ${scope === 'history' ? 'bg-white text-black' : 'text-white/50'}`}>История</button>
      </div>

      {error && <p className="rounded-2xl border border-rose-400/10 bg-rose-400/[0.06] px-3 py-3 text-sm text-rose-100/70">{error}</p>}
      {success && <p className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.06] px-3 py-3 text-sm text-emerald-100/75">{success}</p>}

      {scope === 'shop' ? (
        <Section title="Доступные товары">
          {data?.shop_items.length ? (
            <div className="space-y-2">
              {data.shop_items.map((item) => {
                const affordable = Number(data.balance || 0) >= Number(item.price || 0);
                return (
                  <article key={item.id} className="rounded-2xl bg-black/20 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-2xl">{item.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-white">{item.name}</div>
                        <p className="mt-1 text-xs leading-5 text-white/40">{item.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                      <div><div className="text-[10px] uppercase tracking-[0.12em] text-white/30">Цена</div><div className="mt-0.5 font-semibold text-white/80">{formatTokens(item.price)} 🪙</div></div>
                      <button
                        type="button"
                        disabled={!affordable || buying}
                        onClick={() => { setSuccess(null); setActiveItem(item); }}
                        className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${affordable ? 'bg-white text-black' : 'bg-white/[0.05] text-white/25'}`}
                      >
                        {affordable ? 'Купить' : 'Не хватает'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Сейчас в магазине нет товаров.</p>}

          <div className="mt-3 rounded-2xl bg-black/20 px-3 py-3 text-xs leading-5 text-white/40">
            Жетоны начисляются автоматически по итогам клубных игр. Все начисления, штрафы и покупки можно проверить во вкладке «История».
          </div>
        </Section>
      ) : (
        <>
          <Section title="Мои покупки">
            {data?.purchases.length ? <div className="space-y-2">{data.purchases.map((purchase) => (
              <div key={purchase.id} className="rounded-2xl bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-white">{purchase.item_name_snapshot}</div><div className="mt-1 text-xs text-white/35">{formatDateTime(purchase.purchased_at)}</div></div>
                  <div className="shrink-0 text-right"><div className="text-sm font-semibold text-rose-200/80">−{formatTokens(purchase.price_snapshot)} 🪙</div><div className="mt-1 text-[10px] text-white/30">{purchaseStatusLabel(purchase.status)}</div></div>
                </div>
              </div>
            ))}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Покупок пока нет.</p>}
          </Section>

          <Section title="История жетонов">
            {data?.ledger.items.length ? <div className="space-y-2">{data.ledger.items.map((entry) => (
              <div key={entry.id} className="rounded-2xl bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium text-white/80">{entry.description}</div><div className="mt-1 text-xs text-white/30">{formatDateTime(entry.created_at)}</div></div>
                  <div className="shrink-0 text-right"><div className={`text-sm font-semibold ${entry.amount > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{entry.amount > 0 ? '+' : ''}{formatTokens(entry.amount)} 🪙</div><div className="mt-1 text-[10px] text-white/30">баланс {formatTokens(entry.balance_after)}</div></div>
                </div>
              </div>
            ))}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">История жетонов пока пустая.</p>}
          </Section>
        </>
      )}

      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-[410px] rounded-[28px] border border-white/10 bg-[#15161b] p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.07] text-3xl">{activeItem.icon}</div>
              <div className="min-w-0 flex-1"><div className="text-lg font-semibold text-white">{activeItem.name}</div><p className="mt-1 text-sm leading-5 text-white/45">{activeItem.description}</p></div>
            </div>
            <div className="mt-4 rounded-2xl bg-black/25 p-3 text-sm">
              <div className="flex justify-between text-white/45"><span>Сейчас</span><span>{formatTokens(data?.balance || 0)} 🪙</span></div>
              <div className="mt-2 flex justify-between text-white/45"><span>Покупка</span><span>−{formatTokens(activeItem.price)} 🪙</span></div>
              <div className="mt-2 flex justify-between border-t border-white/[0.06] pt-2 font-semibold text-white/80"><span>Останется</span><span>{formatTokens((data?.balance || 0) - activeItem.price)} 🪙</span></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={buying} onClick={() => setActiveItem(null)} className="min-h-11 rounded-xl bg-white/[0.06] text-sm font-medium text-white/60">Отмена</button>
              <button type="button" disabled={buying} onClick={() => void confirmPurchase()} className="min-h-11 rounded-xl bg-white text-sm font-semibold text-black disabled:opacity-50">{buying ? 'Покупаем…' : 'Подтвердить'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
