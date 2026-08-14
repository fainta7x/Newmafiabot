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
    <div className="fixed inset-x-0 top-0 z-[53] h-14 border-b border-white/[0.07] bg-[#0b0c10]/92 backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-[430px] items-center justify-between gap-3 px-3 pr-[58px]">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold tracking-[0.12em] text-white/72">2LA Noire</div>
          <div className="mt-0.5 truncate text-[10px] text-white/28">{player.nickname}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenWallet}
            aria-label="Открыть кошелёк"
            className={`flex h-10 items-center gap-1.5 rounded-2xl border px-2.5 text-xs font-semibold transition ${active === 'wallet' ? 'border-amber-200/20 bg-amber-200/[0.10] text-amber-50' : 'border-white/10 bg-white/[0.045] text-white/65'}`}
          >
            <span aria-hidden>🪙</span>
            <span className="tabular-nums">{Math.trunc(Number(tokenBalance || 0)).toLocaleString('ru-RU')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Открыть профиль"
            className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl border transition ${active === 'profile' ? 'border-white/25 bg-white/[0.12]' : 'border-white/10 bg-white/[0.045]'}`}
          >
            {player.avatar_url ? (
              <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-white/70">{player.nickname.slice(0, 1).toUpperCase()}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
