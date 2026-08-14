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
    <div className="fixed right-[58px] top-3 z-[54] flex items-center gap-1.5">
      <button
        type="button"
        onClick={onOpenWallet}
        aria-label="Открыть кошелёк"
        className={`flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-xs font-semibold shadow-xl backdrop-blur ${active === 'wallet' ? 'border-amber-200/20 bg-amber-200/[0.10] text-amber-50' : 'border-white/10 bg-[#1b1c21]/95 text-white/65'}`}
      >
        <span aria-hidden>🪙</span>
        <span className="tabular-nums">{Math.trunc(Number(tokenBalance || 0)).toLocaleString('ru-RU')}</span>
      </button>

      <button
        type="button"
        onClick={onOpenProfile}
        aria-label="Открыть профиль"
        className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl border shadow-xl backdrop-blur ${active === 'profile' ? 'border-white/25 bg-white/[0.12]' : 'border-white/10 bg-[#1b1c21]/95'}`}
      >
        {player.avatar_url ? (
          <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-semibold text-white/70">{player.nickname.slice(0, 1).toUpperCase()}</span>
        )}
      </button>
    </div>
  );
}
