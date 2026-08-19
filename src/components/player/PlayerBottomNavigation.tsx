import {
  CalendarDays,
  Gamepad2,
  Home,
  Trophy,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  PLAYER_CABINET_NAV,
  isPlayerCabinetNavActive,
  type PlayerCabinetNavId,
  type PlayerCabinetSection,
} from './playerCabinetNavigation.ts';

const NAV_ICONS: Record<PlayerCabinetNavId, LucideIcon> = {
  home: Home,
  events: CalendarDays,
  games: Gamepad2,
  rating: Trophy,
  club: UsersRound,
};

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
      className="ds-chrome fixed inset-x-0 bottom-0 z-[var(--ds-layer-sticky)] border-t px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),8px)]"
    >
      <div className="mx-auto grid w-full max-w-[430px] grid-cols-5 gap-0.5">
        {PLAYER_CABINET_NAV.map((item) => {
          const active = isPlayerCabinetNavActive(item.id, section);
          const Icon = NAV_ICONS[item.id];

          return (
            <button
              key={item.id}
              data-testid={`player-nav-${item.id}`}
              type="button"
              onClick={() => onOpen(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`ds-focus-ring group flex min-h-[58px] min-w-0 flex-col items-center justify-center rounded-[var(--ds-radius-sm)] px-1 text-[10px] font-medium transition-colors ${
                active ? 'ds-nav-active' : 'text-muted-foreground hover:bg-[var(--ds-surface-hover)] hover:text-foreground'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
              <span className="mt-1 max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
