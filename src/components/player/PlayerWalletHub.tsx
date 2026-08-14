import { useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerEconomy from './PlayerEconomy.tsx';
import PlayerPayments from './PlayerPayments.tsx';

type WalletView = 'payments' | 'tokens';

export default function PlayerWalletHub({
  data,
  tokenBalance,
  onBalanceChange,
}: {
  data: PlayerMeResponse;
  tokenBalance: number;
  onBalanceChange: (balance: number) => void;
}) {
  const [view, setView] = useState<WalletView>('payments');

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-2">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Кошелёк</h1>
              <p className="mt-1 text-sm text-white/45">Оплата вечеров, магазин и игровые жетоны</p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/[0.055] px-3 py-2 text-right">
              <div className="text-sm font-semibold text-white/80">{Math.trunc(Number(tokenBalance)).toLocaleString('ru-RU')} 🪙</div>
              <div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-white/25">баланс</div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.05] p-1">
          <button
            type="button"
            onClick={() => setView('payments')}
            className={`min-h-11 rounded-xl px-3 text-xs font-semibold transition ${view === 'payments' ? 'bg-white text-black' : 'text-white/45'}`}
          >
            Оплата
          </button>
          <button
            type="button"
            onClick={() => setView('tokens')}
            className={`min-h-11 rounded-xl px-3 text-xs font-semibold transition ${view === 'tokens' ? 'bg-white text-black' : 'text-white/45'}`}
          >
            Магазин и ставки
          </button>
        </div>

        {view === 'payments' ? (
          <div className="wallet-payments-embedded">
            <style>{`.wallet-payments-embedded > div > div:first-child{display:none!important}`}</style>
            <PlayerPayments />
          </div>
        ) : (
          <PlayerEconomy onBalanceChange={onBalanceChange} />
        )}
      </div>
    </main>
  );
}
