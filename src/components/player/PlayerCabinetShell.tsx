import { useEffect, useState, type ComponentProps } from 'react';
import LegacyPlayerCabinetShell, { type PlayerCabinetSection as LegacySection } from './PlayerCabinetShellLegacy.tsx';
import PlayerClubHub from './PlayerClubHub.tsx';
import PlayerEventsCalendar from './PlayerEventsCalendar.tsx';
import PlayerGamesHub, { type PlayerGamesSection } from './PlayerGamesHub.tsx';
import PlayerHomeDashboard from './PlayerHomeDashboard.tsx';
import PlayerLiveCenter from './PlayerLiveCenter.tsx';
import PlayerProfileHub from './PlayerProfileHub.tsx';
import PlayerQuickAccessBar from './PlayerQuickAccessBar.tsx';
import PlayerRatingHub, { type PlayerRatingSection } from './PlayerRatingHub.tsx';
import PlayerSmartNotifications, { type PlayerNotificationDestination } from './PlayerSmartNotifications.tsx';
import PlayerWalletHub from './PlayerWalletHub.tsx';

export type PlayerCabinetSection = LegacySection | 'events' | 'ratingperiods' | 'wallet';

type LegacyProps = ComponentProps<typeof LegacyPlayerCabinetShell>;
type Props = Omit<LegacyProps, 'initialSection' | 'onSectionChange'> & {
  initialSection?: PlayerCabinetSection;
  onSectionChange?: (section: PlayerCabinetSection, target?: string | null) => void;
};

type NavId = 'home' | 'events' | 'games' | 'rating' | 'club';
const NAV: Array<{ id: NavId; icon: string; label: string }> = [
  { id: 'home', icon: '⌂', label: 'Главная' },
  { id: 'events', icon: '▣', label: 'События' },
  { id: 'games', icon: '◫', label: 'Игры' },
  { id: 'rating', icon: '★', label: 'Рейтинг' },
  { id: 'club', icon: '◆', label: 'Клуб' },
];

const gameSections = new Set<PlayerCabinetSection>(['games', 'stats', 'career', 'recaps']);
const ratingSections = new Set<PlayerCabinetSection>(['rating', 'elo', 'ratingperiods', 'clubworld']);

const normalizeSection = (section: PlayerCabinetSection): PlayerCabinetSection => {
  if (section === 'more') return 'club';
  if (section === 'payments') return 'wallet';
  return section;
};

export default function PlayerCabinetShell({ initialSection = 'home', onSectionChange, ...props }: Props) {
  const [section, setSection] = useState<PlayerCabinetSection>(() => normalizeSection(initialSection));
  const [player, setPlayer] = useState(props.data.player);
  const [tokenBalance, setTokenBalance] = useState(Number(props.data.player.tokens || 0));

  useEffect(() => setSection(normalizeSection(initialSection)), [initialSection]);
  useEffect(() => {
    setPlayer(props.data.player);
    setTokenBalance(Number(props.data.player.tokens || 0));
  }, [props.data.player]);

  const open = (requested: PlayerCabinetSection, target: string | null = null) => {
    const next = normalizeSection(requested);
    setSection(next);
    onSectionChange?.(next, target);
  };

  const handleNotificationNavigation = (destination: PlayerNotificationDestination, target?: string | null) => {
    return open(destination as PlayerCabinetSection, target || null);
  };

  const currentData = { ...props.data, player };
  const legacyProps = { ...props, data: currentData };
  const legacySection: LegacySection = section === 'events'
    || section === 'home'
    || section === 'wallet'
    || section === 'club'
    || section === 'profile'
    || gameSections.has(section)
    || ratingSections.has(section)
    ? 'games'
    : section as LegacySection;

  return (
    <div className="player-events-shell min-h-screen bg-[#090a0d] text-white">
      <style>{`
        .player-events-shell .legacy-cabinet-wrap nav.fixed{display:none!important}
        .player-events-shell .legacy-cabinet-wrap button[aria-label="Уведомления"]{display:none!important}
        .player-events-shell main{padding-top:.75rem!important}
        .player-events-shell .legacy-cabinet-wrap div[class*="tracking-[0.2em]"][class*="text-white/35"]{display:none!important}
        .player-events-shell .legacy-cabinet-wrap div[class*="px-1"][class*="pb-1"][class*="pt-2"]{padding-top:.25rem!important}
      `}</style>

      <PlayerQuickAccessBar
        player={player}
        tokenBalance={tokenBalance}
        active={section === 'wallet' ? 'wallet' : section === 'profile' ? 'profile' : null}
        onOpenWallet={() => open('wallet')}
        onOpenProfile={() => open('profile')}
      />
      <PlayerSmartNotifications onNavigate={handleNotificationNavigation} />
      <div className="h-14" aria-hidden="true" />

      {section === 'home' ? (
        <PlayerHomeDashboard
          data={currentData}
          canOpenAdmin={Boolean(props.canOpenAdmin)}
          onOpenEvents={(eventId) => open('events', eventId || null)}
          onOpenGames={() => open('games')}
          onOpenRating={() => open('rating')}
          onOpenConduct={() => open('conduct')}
        />
      ) : section === 'events' ? (
        <PlayerEventsCalendar
          initialEventId={props.initialTarget || null}
          onEventChange={(eventId) => open('events', eventId)}
        />
      ) : gameSections.has(section) ? (
        <PlayerGamesHub
          data={currentData}
          canOpenAdmin={Boolean(props.canOpenAdmin)}
          section={section as PlayerGamesSection}
          target={props.initialTarget || null}
          onOpen={(next, target) => open(next as PlayerCabinetSection, target || null)}
        />
      ) : ratingSections.has(section) ? (
        <PlayerRatingHub
          data={currentData}
          section={section as PlayerRatingSection}
          onOpen={(next) => open(next as PlayerCabinetSection)}
        />
      ) : section === 'club' ? (
        <PlayerClubHub data={currentData} />
      ) : section === 'wallet' ? (
        <PlayerWalletHub data={currentData} tokenBalance={tokenBalance} onBalanceChange={setTokenBalance} />
      ) : section === 'profile' ? (
        <PlayerProfileHub data={currentData} onPlayerChange={setPlayer} />
      ) : (
        <div className="legacy-cabinet-wrap">
          <LegacyPlayerCabinetShell
            {...legacyProps}
            initialSection={legacySection}
            onSectionChange={(next, target) => open(next, target || null)}
          />
        </div>
      )}

      <PlayerLiveCenter />

      <nav className="fixed inset-x-0 bottom-0 z-[100] border-t border-white/10 bg-[#0b0c10]/95 px-1 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-xl">
        <div className="mx-auto grid w-full max-w-[430px] grid-cols-5 gap-0.5">
          {NAV.map((item) => {
            const active = item.id === 'games'
              ? gameSections.has(section)
              : item.id === 'rating'
                ? ratingSections.has(section)
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
