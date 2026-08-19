import { Coins } from 'lucide-react';
import type { PlayerMeResponse } from '../../types/player.ts';

export default function PlayerQuickAccessBar({
  player,
  tokenBalance,
  active,
  onOpenWallet,
  onOpenProfile,
}: {
  player: PlayerMeResponse['player'];
  tokenBalance: number;
  active: 'wallet' | 'profile' | null;
  onOpenWallet: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <header
      data-testid="player-top-bar"
      className="fixed inset-x-0 top-0 z-[var(--ds-layer-sticky)] h-14 border-b border-border bg-[var(--ds-surface)] backdrop-blur-xl"
    >
      <div className="mx-auto flex h-full w-full max-w-[430px] items-center justify-between gap-3 px-3 pr-[58px]">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold tracking-[0.12em] text-foreground">2LA Noire</div>
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{player.nickname}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            data-testid="player-quick-wallet"
            type="button"
            onClick={onOpenWallet}
            aria-label="Открыть кошелёк"
            aria-pressed={active === 'wallet'}
            className={`ds-focus-ring flex min-h-[var(--ds-touch-min)] items-center gap-1.5 rounded-[var(--ds-radius-md)] border px-3 text-xs font-bold tabular-nums transition-colors ${
              active === 'wallet'
                ? 'border-primary/30 bg-[var(--ds-primary-soft)] text-primary'
                : 'border-border bg-secondary text-muted-foreground hover:bg-ui-accent hover:text-foreground'
            }`}
          >
            <Coins className="h-4 w-4" aria-hidden="true" />
            <span>{Math.trunc(Number(tokenBalance || 0)).toLocaleString('ru-RU')}</span>
          </button>

          <button
            data-testid="player-quick-profile"
            type="button"
            onClick={onOpenProfile}
            aria-label="Открыть профиль"
            aria-pressed={active === 'profile'}
            className={`ds-focus-ring grid h-[var(--ds-touch-min)] w-[var(--ds-touch-min)] shrink-0 place-items-center overflow-hidden rounded-[var(--ds-radius-md)] border transition-colors ${
              active === 'profile'
                ? 'border-primary/35 bg-[var(--ds-primary-soft)] shadow-[var(--ds-shadow-focus)]'
                : 'border-border bg-secondary hover:bg-ui-accent'
            }`}
          >
            {player.avatar_url ? (
              <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-foreground">{player.nickname.slice(0, 1).toUpperCase()}</span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
