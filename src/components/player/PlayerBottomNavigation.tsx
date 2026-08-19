import {
  PLAYER_CABINET_NAV,
  isPlayerCabinetNavActive,
  type PlayerCabinetNavId,
  type PlayerCabinetSection,
} from './playerCabinetNavigation.ts';

export default function PlayerBottomNavigation({
  section,
  onOpen,
}: {
  section: PlayerCabinetSection;
  onOpen: (section: PlayerCabinetNavId) => void;
}) {
  return (
    <nav
      data-testid="player-bottom-nav"
      aria-label="Основная навигация"
      className="ds-chrome-bottom fixed inset-x-0 bottom-0 z-[var(--ds-layer-sticky)] border-t px-1 pt-2 pb-[max(env(safe-area-inset-bottom),8px)]"
    >
      <div className="mx-auto grid w-full max-w-[430px] grid-cols-5 gap-0.5">
        {PLAYER_CABINET_NAV.map((item) => {
          const active = isPlayerCabinetNavActive(item.id, section);

          return (
            <button
              key={item.id}
              data-testid={`player-nav-${item.id}`}
              type="button"
              onClick={() => onOpen(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`ds-focus-ring flex min-h-[58px] min-w-0 flex-col items-center justify-center rounded-xl px-0.5 text-[9px] font-medium transition-colors ${
                active ? 'ds-nav-active text-white' : 'text-white/40 hover:text-white/65'
              }`}
            >
              <span className="text-base leading-none" aria-hidden="true">{item.icon}</span>
              <span className="mt-1 max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
