import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerEconomyPanel, { type WalletEconomyView } from './PlayerEconomyPanel.tsx';
import PlayerPayments from './PlayerPayments.tsx';
import { TokenIcon } from '../ui/TokenIcon.tsx';
import { formatRubles } from '../../lib/formatRubleAmount.ts';
import { usePlayerDebtSummary } from '../../hooks/usePlayerDebtSummary.ts';

type WalletView = 'payments' | WalletEconomyView;

const NAV: Array<{ id: WalletView; label: string; icon: string }> = [
  { id: 'payments', label: 'Оплата', icon: '₽' },
  { id: 'shop', label: 'Магазин', icon: '◇' },
  { id: 'bets', label: 'Ставки', icon: '◉' },
  { id: 'history', label: 'История', icon: '↺' },
];

// Telegram/VK «Сделать ставку» opens /player/wallet?tab=bets.
const initialWalletView = (target?: string | null): WalletView => {
  if (NAV.some((item) => item.id === target)) return target as WalletView;
  try {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return NAV.some((item) => item.id === tab) ? tab as WalletView : 'payments';
  } catch { return 'payments'; }
};

const rubles = (value: number | null) => value == null ? '…' : formatRubles(value);

export default function PlayerWalletHub({
  tokenBalance,
  onBalanceChange,
  target = null,
  onOpen,
}: {
  data: PlayerMeResponse;
  tokenBalance: number;
  onBalanceChange: (balance: number) => void;
  target?: string | null;
  onOpen?: (view: WalletView) => void;
}) {
  const [view, setView] = useState<WalletView>(() => initialWalletView(target));
  useEffect(() => { setView(initialWalletView(target)); }, [target]);
  const debt = usePlayerDebtSummary(view);
  const outstanding = debt.amount;

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
            <div className={`mt-2 text-xl font-semibold ${Number(outstanding || 0) > 0 ? 'text-rose-100' : 'text-white/80'}`}>{outstanding === null && debt.status === 'error' ? '—' : rubles(outstanding)}</div>
            <div className="mt-1 text-[11px] text-white/25">только за посещённые вечера</div>
            {debt.status === 'loading' && <p role="status" className="mt-2 text-xs text-white/55">Обновляем сумму…</p>}
          </div>
          <div className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">Жетоны</div>
            <div className="mt-2 text-xl font-semibold text-white/80">{Math.trunc(Number(tokenBalance)).toLocaleString('ru-RU')} <TokenIcon /></div>
            <div className="mt-1 text-[11px] text-white/25">магазин и ставки</div>
          </div>
          {debt.status === 'error' && <div role="alert" data-testid="wallet-debt-error" className="col-span-2 flex items-center gap-3 rounded-2xl border border-amber-200/15 bg-amber-200/[0.04] px-3 py-2 text-xs leading-5 text-amber-100/80">
            <p className="min-w-0 flex-1">{outstanding === null ? 'Не удалось загрузить долг.' : 'Не удалось обновить. Показана последняя сумма.'}</p>
            <button type="button" onClick={() => void debt.reload()} className="min-h-11 shrink-0 rounded-xl border border-white/15 px-3 text-xs font-semibold text-white">Повторить</button>
          </div>}
        </section>

        <nav className="grid grid-cols-4 gap-1 rounded-2xl bg-white/[0.05] p-1" aria-label="Разделы кошелька">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setView(item.id); onOpen?.(item.id); }}
              aria-current={view === item.id ? 'page' : undefined}
              className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-xl px-1 text-[11px] font-semibold transition ${view === item.id ? 'bg-white text-black' : 'text-white/42'}`}
            >
              <span className="text-sm leading-none">{item.icon}</span>
              <span className="mt-1 truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        {view === 'payments' && (
          <PlayerPayments view="current" onChanged={() => void debt.reload()} />
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
