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
      className="fixed inset-x-0 bottom-0 z-[var(--ds-layer-sticky)] border-t border-border bg-card/95 px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),8px)] backdrop-blur-xl"
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
              className="ds-focus-ring group flex min-h-[58px] min-w-0 flex-col items-center justify-center rounded-[var(--ds-radius-md)] px-1 text-[10px] font-semibold transition-colors hover:bg-ui-accent"
            >
              <span
                aria-hidden="true"
                className={`grid h-7 min-w-10 place-items-center rounded-full transition-colors ${
                  active
                    ? 'bg-[var(--ds-primary-soft)] text-primary'
                    : 'text-muted-foreground group-hover:text-foreground'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.35 : 2} />
              </span>
              <span className={`mt-1 max-w-full truncate ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
