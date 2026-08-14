import { useEffect, useState, type ComponentProps } from 'react';
import LegacyPlayerCabinetShell, { type PlayerCabinetSection as LegacySection } from './PlayerCabinetShellLegacy.tsx';
import PlayerClubHub from './PlayerClubHub.tsx';
import PlayerEventsCalendar from './PlayerEventsCalendar.tsx';
import PlayerGamesHub, { type PlayerGamesSection } from './PlayerGamesHub.tsx';
import PlayerHomeDashboard from './PlayerHomeDashboard.tsx';
import PlayerMoreHub from './PlayerMoreHub.tsx';
import PlayerProfileHub from './PlayerProfileHub.tsx';
import PlayerRatingHub, { type PlayerRatingSection } from './PlayerRatingHub.tsx';
import PlayerSmartNotifications, { type PlayerNotificationDestination } from './PlayerSmartNotifications.tsx';

export type PlayerCabinetSection = LegacySection | 'events' | 'ratingperiods';

type LegacyProps = ComponentProps<typeof LegacyPlayerCabinetShell>;
type Props = Omit<LegacyProps, 'initialSection' | 'onSectionChange'> & {
  initialSection?: PlayerCabinetSection;
  onSectionChange?: (section: PlayerCabinetSection, target?: string | null) => void;
};

type NavId = 'home' | 'events' | 'games' | 'rating' | 'more';
const NAV: Array<{ id: NavId; icon: string; label: string }> = [
  { id: 'home', icon: '⌂', label: 'Главная' },
  { id: 'events', icon: '▣', label: 'События' },
  { id: 'games', icon: '◫', label: 'Игры' },
  { id: 'rating', icon: '★', label: 'Рейтинг' },
  { id: 'more', icon: '•••', label: 'Ещё' },
];

const primary = new Set<PlayerCabinetSection>(['home', 'events', 'games', 'rating']);
const gameSections = new Set<PlayerCabinetSection>(['games', 'stats', 'career', 'recaps']);
const ratingSections = new Set<PlayerCabinetSection>(['rating', 'elo', 'ratingperiods', 'clubworld']);

export default function PlayerCabinetShell({ initialSection = 'home', onSectionChange, ...props }: Props) {
  const [section, setSection] = useState<PlayerCabinetSection>(initialSection);
  useEffect(() => setSection(initialSection), [initialSection]);

  const open = (next: PlayerCabinetSection, target: string | null = null) => {
    setSection(next);
    onSectionChange?.(next, target);
  };

  const handleNotificationNavigation = (destination: PlayerNotificationDestination, target?: string | null) => {
    if (destination === 'events') return open('events');
    return open(destination as PlayerCabinetSection, target || null);
  };

  const legacySection: LegacySection = section === 'events' || section === 'home' || section === 'more' || section === 'club' || section === 'profile' || gameSections.has(section) || ratingSections.has(section) ? 'games' : section as LegacySection;
  const moreActive = !primary.has(section) && !gameSections.has(section) && !ratingSections.has(section);

  return (
    <div className="player-events-shell bg-[#090a0d] text-white">
      <style>{`
        .player-events-shell .legacy-cabinet-wrap nav.fixed{display:none!important}
        .player-events-shell .legacy-cabinet-wrap button[aria-label="Уведомления"]{display:none!important}
        button[class*="bottom-[154px]"][class*="z-40"]{display:none!important}
      `}</style>
      {section === 'home' ? (
        <PlayerHomeDashboard
          data={props.data}
          onOpenEvents={() => open('events')}
          onOpenGames={() => open('games')}
          onOpenRating={() => open('rating')}
        />
      ) : section === 'events' ? (
        <PlayerEventsCalendar />
      ) : gameSections.has(section) ? (
        <PlayerGamesHub
          data={props.data}
          canOpenAdmin={Boolean(props.canOpenAdmin)}
          section={section as PlayerGamesSection}
          target={props.initialTarget || null}
          onOpen={(next, target) => open(next as PlayerCabinetSection, target || null)}
        />
      ) : ratingSections.has(section) ? (
        <PlayerRatingHub
          data={props.data}
          section={section as PlayerRatingSection}
          onOpen={(next) => open(next as PlayerCabinetSection)}
        />
      ) : section === 'club' ? (
        <PlayerClubHub data={props.data} />
      ) : section === 'profile' ? (
        <PlayerProfileHub data={props.data} />
      ) : section === 'more' ? (
        <PlayerMoreHub
          data={props.data}
          canOpenAdmin={Boolean(props.canOpenAdmin)}
          onOpen={(next) => open(next)}
        />
      ) : (
        <div className="legacy-cabinet-wrap">
          <LegacyPlayerCabinetShell
            {...props}
            initialSection={legacySection}
            onSectionChange={(next, target) => open(next, target || null)}
          />
        </div>
      )}

      <PlayerSmartNotifications onNavigate={handleNotificationNavigation} />

      <nav className="fixed inset-x-0 bottom-0 z-[100] border-t border-white/10 bg-[#0b0c10]/95 px-1 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-xl">
        <div className="mx-auto grid w-full max-w-[430px] grid-cols-5 gap-0.5">
          {NAV.map((item) => {
            const active = item.id === 'games'
              ? gameSections.has(section)
              : item.id === 'rating'
                ? ratingSections.has(section)
                : item.id === 'more'
                  ? moreActive
                  : section === item.id;
            return (
              <button key={item.id} type="button" onClick={() => open(item.id)} className={`flex min-h-13 min-w-0 flex-col items-center justify-center rounded-xl px-0.5 text-[9px] font-medium ${active ? 'bg-white/[0.09] text-white' : 'text-white/40'}`}>
                <span className="text-base leading-none">{item.icon}</span>
                <span className="mt-1 max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
