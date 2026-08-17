import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerEconomyPanel, { type WalletEconomyView } from './PlayerEconomyPanel.tsx';
import PlayerPayments from './PlayerPayments.tsx';

type WalletView = 'payments' | WalletEconomyView;

const NAV: Array<{ id: WalletView; label: string; icon: string }> = [
  { id: 'payments', label: 'Оплата', icon: '₽' },
  { id: 'shop', label: 'Магазин', icon: '◇' },
  { id: 'bets', label: 'Ставки', icon: '◉' },
  { id: 'history', label: 'История', icon: '↺' },
];

const rubles = (value: number | null) => value == null
  ? '…'
  : `${Math.max(0, Math.trunc(Number(value || 0))).toLocaleString('ru-RU')} ₽`;

export default function PlayerWalletHub({
  tokenBalance,
  onBalanceChange,
}: {
  data: PlayerMeResponse;
  tokenBalance: number;
  onBalanceChange: (balance: number) => void;
}) {
  const [view, setView] = useState<WalletView>('payments');
  const [outstanding, setOutstanding] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/payments', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;
        setOutstanding(Number(body?.summary?.outstanding || 0));
      } catch {
        if (!cancelled) setOutstanding(null);
      }
    })();
    return () => { cancelled = true; };
  }, [view]);

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-1">
          <h1 className="text-2xl font-semibold">Кошелёк</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Оплаты, магазин, ставки и история операций</p>
        </header>

        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/30">К оплате</div>
            <div className={`mt-2 text-xl font-semibold ${Number(outstanding || 0) > 0 ? 'text-rose-100' : 'text-white/80'}`}>{rubles(outstanding)}</div>
            <div className="mt-1 text-[10px] text-white/25">по игровым вечерам</div>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/30">Жетоны</div>
            <div className="mt-2 text-xl font-semibold text-white/80">{Math.trunc(Number(tokenBalance)).toLocaleString('ru-RU')} 🪙</div>
            <div className="mt-1 text-[10px] text-white/25">магазин и ставки</div>
          </div>
        </section>

        <nav className="grid grid-cols-4 gap-1 rounded-2xl bg-white/[0.05] p-1" aria-label="Разделы кошелька">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-xl px-1 text-[10px] font-semibold transition ${view === item.id ? 'bg-white text-black' : 'text-white/42'}`}
            >
              <span className="text-sm leading-none">{item.icon}</span>
              <span className="mt-1 truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        {view === 'payments' && (
          <div className="wallet-payments-current">
            <style>{`
              .wallet-payments-current > div > div:first-child{display:none!important}
              .wallet-payments-current > div > section:last-child{display:none!important}
            `}</style>
            <PlayerPayments />
          </div>
        )}

        {(view === 'shop' || view === 'bets') && (
          <PlayerEconomyPanel view={view} onBalanceChange={onBalanceChange} />
        )}

        {view === 'history' && (
          <div className="space-y-4">
            <section>
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Оплаты вечеров</div>
              <div className="wallet-payment-history">
                <style>{`
                  .wallet-payment-history > div > div:first-child{display:none!important}
                  .wallet-payment-history > div > section:not(:last-child){display:none!important}
                `}</style>
                <PlayerPayments />
              </div>
            </section>

            <section>
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Жетоны и покупки</div>
              <PlayerEconomyPanel view="history" onBalanceChange={onBalanceChange} />
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
