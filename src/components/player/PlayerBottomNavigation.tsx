import { CalendarDays, Gamepad2, House, Trophy, UsersRound, type LucideIcon } from 'lucide-react';
import {
  PLAYER_CABINET_NAV,
  isPlayerCabinetNavActive,
  type PlayerCabinetNavId,
  type PlayerCabinetSection,
} from './playerCabinetNavigation.ts';

const NAV_ICONS: Record<PlayerCabinetNavId, LucideIcon> = {
  home: House,
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
      className="ds-chrome-bottom fixed inset-x-0 bottom-0 z-[var(--ds-layer-sticky)] border-t px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),8px)]"
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
              aria-label={item.label}
              className={`ds-focus-ring flex min-h-12 min-w-0 flex-col items-center justify-center rounded-xl px-0.5 text-[12px] font-semibold leading-none ${
                active ? 'ds-nav-active text-white' : 'text-white/55 hover:text-white/75'
              }`}
            >
              <Icon className="size-5 shrink-0" strokeWidth={active ? 2.3 : 2} aria-hidden="true" />
              <span className="mt-1 max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}