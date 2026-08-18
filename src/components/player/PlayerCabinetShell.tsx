import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerClubHub from './PlayerClubHub.tsx';
import PlayerConductCenter from './PlayerConductCenter.tsx';
import PlayerEventsCalendar from './PlayerEventsCalendar.tsx';
import PlayerGamesHub, { type PlayerGamesSection } from './PlayerGamesHub.tsx';
import PlayerHomeDashboard from './PlayerHomeDashboard.tsx';
import PlayerLiveOnlyCenter from './PlayerLiveOnlyCenter.tsx';
import PlayerProfileHub from './PlayerProfileHub.tsx';
import PlayerQuickAccessBar from './PlayerQuickAccessBar.tsx';
import PlayerRatingHub, { type PlayerRatingSection } from './PlayerRatingHub.tsx';
import PlayerSmartNotifications, { type PlayerNotificationDestination } from './PlayerSmartNotifications.tsx';
import PlayerWalletHub from './PlayerWalletHub.tsx';
import {
  PLAYER_CABINET_NAV,
  isPlayerCabinetNavActive,
  isPlayerGameSection,
  isPlayerRatingSection,
  normalizePlayerCabinetSection,
  type PlayerCabinetSection,
} from './playerCabinetNavigation.ts';

export type { PlayerCabinetSection } from './playerCabinetNavigation.ts';

type Props = {
  data: PlayerMeResponse;
  canOpenAdmin?: boolean;
  initialSection?: PlayerCabinetSection;
  initialTarget?: string | null;
  onSectionChange?: (section: PlayerCabinetSection, target?: string | null) => void;
};

export default function PlayerCabinetShell({
  data,
  canOpenAdmin = false,
  initialSection = 'home',
  initialTarget = null,
  onSectionChange,
}: Props) {
  const [section, setSection] = useState<PlayerCabinetSection>(() => normalizePlayerCabinetSection(initialSection));
  const [player, setPlayer] = useState(data.player);
  const [tokenBalance, setTokenBalance] = useState(Number(data.player.tokens || 0));

  useEffect(() => setSection(normalizePlayerCabinetSection(initialSection)), [initialSection]);
  useEffect(() => {
    setPlayer(data.player);
    setTokenBalance(Number(data.player.tokens || 0));
  }, [data.player]);

  const open = (requested: PlayerCabinetSection, target: string | null = null) => {
    const next = normalizePlayerCabinetSection(requested);
    setSection(next);
    onSectionChange?.(next, target);
  };

  const handleNotificationNavigation = (destination: PlayerNotificationDestination, target?: string | null) => {
    return open(destination as PlayerCabinetSection, target || null);
  };

  const currentData = { ...data, player };

  return (
    <div className="player-events-shell min-h-screen bg-[#090a0d] text-white">
      <style>{`.player-events-shell main{padding-top:.75rem!important}`}</style>

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
          canOpenAdmin={canOpenAdmin}
          onOpenEvents={(eventId) => open('events', eventId || null)}
          onOpenGames={() => open('games')}
          onOpenRating={() => open('rating')}
          onOpenConduct={() => open('conduct')}
        />
      ) : section === 'events' ? (
        <PlayerEventsCalendar
          initialEventId={initialTarget}
          onEventChange={(eventId) => open('events', eventId)}
        />
      ) : isPlayerGameSection(section) ? (
        <PlayerGamesHub
          data={currentData}
          canOpenAdmin={canOpenAdmin}
          section={section as PlayerGamesSection}
          target={initialTarget}
          onOpen={(next, target) => open(next as PlayerCabinetSection, target || null)}
        />
      ) : isPlayerRatingSection(section) ? (
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
      ) : section === 'conduct' ? (
        <PlayerConductCenter data={currentData} onBack={() => open('home')} />
      ) : (
        <PlayerHomeDashboard
          data={currentData}
          canOpenAdmin={canOpenAdmin}
          onOpenEvents={(eventId) => open('events', eventId || null)}
          onOpenGames={() => open('games')}
          onOpenRating={() => open('rating')}
          onOpenConduct={() => open('conduct')}
        />
      )}

      <PlayerLiveOnlyCenter />

      <nav className="fixed inset-x-0 bottom-0 z-[100] border-t border-white/10 bg-[#0b0c10]/95 px-1 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-xl">
        <div className="mx-auto grid w-full max-w-[430px] grid-cols-5 gap-0.5">
          {PLAYER_CABINET_NAV.map((item) => {
            const active = isPlayerCabinetNavActive(item.id, section);
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
