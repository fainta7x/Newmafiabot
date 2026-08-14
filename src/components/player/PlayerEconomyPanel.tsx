import { useLayoutEffect, useRef } from 'react';
import PlayerEconomy from './PlayerEconomy.tsx';

export type WalletEconomyView = 'shop' | 'bets' | 'history';

const LABEL: Record<WalletEconomyView, string> = {
  shop: 'Магазин',
  bets: 'Ставки',
  history: 'История',
};

export default function PlayerEconomyPanel({
  view,
  onBalanceChange,
}: {
  view: WalletEconomyView;
  onBalanceChange: (balance: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let done = false;
    const activate = () => {
      const target = Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.trim() === LABEL[view]);
      if (!target) return false;
      target.click();
      done = true;
      return true;
    };

    if (activate()) return;
    const observer = new MutationObserver(() => {
      if (done || activate()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [view]);

  return (
    <div ref={rootRef} className="wallet-economy-embedded">
      <style>{`
        .wallet-economy-embedded > section:first-of-type{display:none!important}
        .wallet-economy-embedded > div.grid.grid-cols-3{display:none!important}
      `}</style>
      <PlayerEconomy onBalanceChange={onBalanceChange} />
    </div>
  );
}
