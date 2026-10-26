import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerEconomyPanel, { type WalletEconomyView } from './PlayerEconomyPanel.tsx';
import PlayerPayments from './PlayerPayments.tsx';
import { TokenIcon } from '../ui/TokenIcon.tsx';
import { formatRubles } from '../../lib/formatRubleAmount.ts';
import { readViewParam, writeViewParam } from '../../lib/urlViewParam';

type WalletView = 'payments' | WalletEconomyView;

const NAV: Array<{ id: WalletView; label: string; icon: string }> = [
  { id: 'payments', label: 'Оплата', icon: '₽' },
  { id: 'shop', label: 'Магазин', icon: '◇' },
  { id: 'bets', label: 'Ставки', icon: '◉' },
  { id: 'history', label: 'История', icon: '↺' },
];

// Telegram/VK «Сделать ставку» opens /player/wallet?tab=bets.
const initialWalletView = (): WalletView => readViewParam('tab', NAV.map((item) => item.id)) ?? 'payments';

const rubles = (value: number | null) => value == null ? '…' : formatRubles(value);

export default function PlayerWalletHub({
  tokenBalance,
  onBalanceChange,
}: {
  data: PlayerMeResponse;
  tokenBalance: number;
  onBalanceChange: (balance: number) => void;
}) {
  const [view, setView] = useState<WalletView>(initialWalletView);
  // A reload or a shared link opens the same part of the wallet.
  useEffect(() => { writeViewParam('tab', view === 'payments' ? null : view); }, [view]);
  const [outstanding, setOutstanding] = useState<number | null>(null);
  // A failed summary must not look like one still loading (global review 2026-10-26): it says so and can be retried.
  const [outstandingFailed, setOutstandingFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/payments', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) { setOutstandingFailed(true); return; }
        setOutstanding(Number(body?.summary?.historical_debt || 0));
        setOutstandingFailed(false);
      } catch {
        if (!cancelled) setOutstandingFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [view, retry]);

  return (
    <main className="player-workspace-page min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="player-workspace mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-1">
          <h1 className="text-2xl font-semibold">Кошелёк</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Оплаты, магазин, ставки и история операций</p>
        </header>

        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">Долг</div>
            {outstandingFailed && outstanding === null ? (
              <>
                <div className="mt-2 text-base font-semibold text-white/60" role="status">Не загрузилось</div>
                <button type="button" onClick={() => { setOutstandingFailed(false); setRetry((value) => value + 1); }} className="mt-1 min-h-11 text-left text-[12px] font-semibold text-white/70 underline underline-offset-2">Повторить</button>
              </>
            ) : (
              <>
                <div className={`mt-2 text-xl font-semibold ${Number(outstanding || 0) > 0 ? 'text-rose-100' : 'text-white/80'}`}>{rubles(outstanding)}</div>
                <div className="mt-1 text-[11px] text-white/25">только за посещённые вечера</div>
              </>
            )}
          </div>
          <div className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">Жетоны</div>
            <div className="mt-2 text-xl font-semibold text-white/80">{Math.trunc(Number(tokenBalance)).toLocaleString('ru-RU')} <TokenIcon /></div>
            <div className="mt-1 text-[11px] text-white/25">магазин и ставки</div>
          </div>
        </section>

        <nav className="grid grid-cols-4 gap-1 rounded-2xl bg-white/[0.05] p-1" aria-label="Разделы кошелька">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-xl px-1 text-[11px] font-semibold transition ${view === item.id ? 'bg-white text-black' : 'text-white/42'}`}
            >
              <span className="text-sm leading-none">{item.icon}</span>
              <span className="mt-1 truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        {view === 'payments' && (
          <PlayerPayments view="current" />
        )}

        {(view === 'shop' || view === 'bets') && (
          <PlayerEconomyPanel view={view} onBalanceChange={onBalanceChange} />
        )}

        {view === 'history' && (
          <div className="space-y-4">
            <section>
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30">Оплаты вечеров</div>
              <PlayerPayments view="history" />
            </section>

            <section>
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30">Жетоны и покупки</div>
              <PlayerEconomyPanel view="history" onBalanceChange={onBalanceChange} />
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
