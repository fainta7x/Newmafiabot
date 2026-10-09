import PlayerEconomy from './PlayerEconomy.tsx';

export type WalletEconomyView = 'shop' | 'bets' | 'history';

/** Direct prop-controlled navigation. Never simulate a click on a hidden child tab. */
export default function PlayerEconomyPanel({
  view,
  onBalanceChange,
}: {
  view: WalletEconomyView;
  onBalanceChange: (balance: number) => void;
}) {
  return (
    <div className="wallet-economy-embedded">
      <style>{`
        .wallet-economy-embedded > section:first-of-type{display:none!important}
        .wallet-economy-embedded > div.grid.grid-cols-3{display:none!important}
      `}</style>
      <PlayerEconomy view={view} onBalanceChange={onBalanceChange} />
    </div>
  );
}
