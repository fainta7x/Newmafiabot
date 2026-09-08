import type { PlayerMeResponse } from '../../types/player.ts';
import ProductModeSwitch from '../ProductModeSwitch.tsx';

export default function PlayerQuickAccessBar({
  player,
  tokenBalance,
  active,
  canOpenAdmin = false,
  onOpenAdmin,
  onOpenWallet,
  onOpenProfile,
}: {
  player: PlayerMeResponse['player'];
  tokenBalance: number;
  active: 'wallet' | 'profile' | null;
  canOpenAdmin?: boolean;
  onOpenAdmin?: () => void;
  onOpenWallet: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <header
      data-testid="player-top-bar"
      className="ds-chrome-top fixed inset-x-0 top-0 z-[var(--ds-layer-sticky)] h-14 border-b"
    >
      <div className="mx-auto flex h-full w-full max-w-[430px] items-center justify-between gap-2 px-3 pr-[58px]">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-[0.08em] text-white/78">2LA Noire</div>
          <div className="mt-0.5 truncate text-[12px] text-white/50">{player.nickname}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canOpenAdmin && onOpenAdmin ? (
            <ProductModeSwitch activeMode="player" onSwitch={onOpenAdmin} />
          ) : null}

          <button
            data-testid="player-quick-wallet"
            type="button"
            onClick={onOpenWallet}
            aria-label={`Открыть кошелёк. Баланс ${Math.trunc(Number(tokenBalance || 0)).toLocaleString('ru-RU')} жетонов`}
            title="Кошелёк"
            aria-pressed={active === 'wallet'}
            className={`ds-focus-ring flex min-h-11 items-center gap-1.5 rounded-2xl border px-2.5 text-sm font-semibold tabular-nums transition ${
              active === 'wallet'
                ? 'border-amber-200/20 bg-amber-200/[0.10] text-amber-50'
                : 'border-white/10 bg-white/[0.045] text-white/72'
            }`}
          >
            <span aria-hidden="true">🪙</span>
            <span>{Math.trunc(Number(tokenBalance || 0)).toLocaleString('ru-RU')}</span>
          </button>

          <button
            data-testid="player-quick-profile"
            type="button"
            onClick={onOpenProfile}
            aria-label={`Открыть профиль ${player.nickname}`}
            title="Профиль"
            aria-pressed={active === 'profile'}
            className={`ds-focus-ring relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl border transition ${
              active === 'profile'
                ? 'border-white/30 bg-white/[0.12] ring-1 ring-white/20'
                : 'border-white/10 bg-white/[0.045]'
            }`}
          >
            {player.avatar_url ? (
              <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-white/75">{player.nickname.slice(0, 1).toUpperCase()}</span>
            )}
            <span className="pointer-events-none absolute bottom-0 inset-x-0 bg-black/55 py-0.5 text-center text-[9px] font-semibold leading-none text-white/80" aria-hidden="true">Профиль</span>
          </button>
        </div>
      </div>
    </header>
  );
}
