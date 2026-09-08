import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerBottomNavigation from './PlayerBottomNavigation.tsx';
import PlayerClubHub from './PlayerClubHub.tsx';
import PlayerConductCenter from './PlayerConductCenter.tsx';
import PlayerEventsCalendar from './PlayerEventsCalendar.tsx';
import PlayerGamesHub, { type PlayerGamesSection } from './PlayerGamesHub.tsx';
import PlayerHomeDashboard from './PlayerHomeDashboard.tsx';
import PlayerLiveOnlyCenter from './PlayerLiveOnlyCenter.tsx';
import PlayerProfileHub from './PlayerProfileHub.tsx';
import CanonicalPremiumPlayerProfile from './CanonicalPremiumPlayerProfile.tsx';
import { PlayerProfileReminder } from './PlayerProfileCompleteness.tsx';
import PlayerQuickAccessBar from './PlayerQuickAccessBar.tsx';
import PlayerRatingHub, { type PlayerRatingSection } from './PlayerRatingHub.tsx';
import PlayerSmartNotifications, { type PlayerNotificationDestination } from './PlayerSmartNotifications.tsx';
import PlayerWalletHub from './PlayerWalletHub.tsx';
import {
  isPlayerGameSection,
  isPlayerRatingSection,
  normalizePlayerCabinetSection,
  type PlayerCabinetSection,
} from './playerCabinetNavigation.ts';

export type { PlayerCabinetSection } from './playerCabinetNavigation.ts';

type Props = {
  data: PlayerMeResponse;
  canOpenAdmin?: boolean;
  onOpenAdmin?: () => void;
  initialSection?: PlayerCabinetSection;
  initialTarget?: string | null;
  onSectionChange?: (section: PlayerCabinetSection, target?: string | null) => void;
};

const profilePlayerIdFromTarget = (target: string | null | undefined) => target?.startsWith('player:') ? target.slice('player:'.length) || null : null;

export default function PlayerCabinetShell({ data, canOpenAdmin = false, onOpenAdmin, initialSection = 'home', initialTarget = null, onSectionChange }: Props) {
  const initialProfilePlayerId = profilePlayerIdFromTarget(initialTarget);
  const [section, setSection] = useState<PlayerCabinetSection>(() => initialProfilePlayerId ? 'club' : normalizePlayerCabinetSection(initialSection));
  const [player, setPlayer] = useState(data.player);
  const [tokenBalance, setTokenBalance] = useState(Number(data.player.tokens || 0));
  const profilePlayerId = profilePlayerIdFromTarget(initialTarget);

  useEffect(() => {
    if (!profilePlayerId) setSection(normalizePlayerCabinetSection(initialSection));
  }, [initialSection, profilePlayerId]);
  useEffect(() => {
    setPlayer(data.player);
    setTokenBalance(Number(data.player.tokens || 0));
  }, [data.player]);
  useEffect(() => {
    if (!profilePlayerId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [profilePlayerId]);

  const open = (requested: PlayerCabinetSection, target: string | null = null) => {
    const next = normalizePlayerCabinetSection(requested);
    setSection(next);
    onSectionChange?.(next, target);
  };
  const handleNotificationNavigation = (destination: PlayerNotificationDestination, target?: string | null) => open(destination as PlayerCabinetSection, target || null);
  const currentData = { ...data, player };

  return (
    <div data-testid="player-cabinet-shell" className="player-events-shell player-cabinet-shell min-h-[var(--tg-viewport-stable-height,100dvh)] bg-background text-foreground">
      <PlayerQuickAccessBar player={player} tokenBalance={tokenBalance} active={section === 'wallet' ? 'wallet' : section === 'profile' ? 'profile' : null} canOpenAdmin={canOpenAdmin} onOpenAdmin={onOpenAdmin} onOpenWallet={() => open('wallet')} onOpenProfile={() => open('profile')} />
      <PlayerSmartNotifications onNavigate={handleNotificationNavigation} />
      <div className="h-14" aria-hidden="true" />
      {section !== 'profile' ? <PlayerProfileReminder playerId={player.id} onOpenProfile={() => open('profile')} /> : null}
      <div data-testid="player-live-status-slot" className={`player-live-status-slot ${section === 'home' ? '' : 'player-live-status-slot--compact'}`}><PlayerLiveOnlyCenter compact={section !== 'home'} /></div>

      {section === 'home' ? (
        <PlayerHomeDashboard data={currentData} onOpenEvents={(eventId) => open('events', eventId || null)} onOpenGames={() => open('games')} onOpenRating={() => open('rating')} />
      ) : section === 'events' ? (
        <PlayerEventsCalendar initialEventId={initialTarget} onEventChange={(eventId) => open('events', eventId)} />
      ) : isPlayerGameSection(section) ? (
        <PlayerGamesHub data={currentData} canOpenAdmin={canOpenAdmin} section={section as PlayerGamesSection} target={initialTarget} onOpen={(next, target) => open(next as PlayerCabinetSection, target || null)} />
      ) : isPlayerRatingSection(section) ? (
        <PlayerRatingHub data={currentData} section={section as PlayerRatingSection} onOpen={(next) => open(next as PlayerCabinetSection)} />
      ) : section === 'club' ? (
        <PlayerClubHub data={currentData} />
      ) : section === 'wallet' ? (
        <PlayerWalletHub data={currentData} tokenBalance={tokenBalance} onBalanceChange={setTokenBalance} />
      ) : section === 'profile' ? (
        <PlayerProfileHub data={currentData} onPlayerChange={setPlayer} />
      ) : section === 'conduct' ? (
        <PlayerConductCenter data={currentData} canOpenAdmin={canOpenAdmin} initialPane={initialTarget === 'music' ? 'music' : 'games'} onPaneChange={(pane) => open('conduct', pane === 'music' ? 'music' : null)} />
      ) : (
        <PlayerHomeDashboard data={currentData} onOpenEvents={(eventId) => open('events', eventId || null)} onOpenGames={() => open('games')} onOpenRating={() => open('rating')} />
      )}

      <PlayerBottomNavigation section={section} onOpen={(next) => open(next)} />

      {profilePlayerId ? (
        <div data-testid="canonical-player-profile-overlay" className="fixed inset-0 z-[90] overflow-hidden bg-[#090a0d]">
          <CanonicalPremiumPlayerProfile playerId={profilePlayerId} mode={profilePlayerId === player.id ? 'self' : 'public'} selfPlayerId={player.id} onClose={() => window.history.back()} />
        </div>
      ) : null}
    </div>
  );
}