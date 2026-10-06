import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerBottomNavigation from './PlayerBottomNavigation.tsx';
import PlayerCommunityHub, { type CommunitySection } from './PlayerCommunityHub.tsx';
import PlayerConductCenter from './PlayerConductCenter.tsx';
import PlayerEveningsHub, { type PlayerEveningsSection } from './PlayerEveningsHub.tsx';
import PlayerHomeDashboard from './PlayerHomeDashboard.tsx';
import PlayerLiveOnlyCenter from './PlayerLiveOnlyCenter.tsx';
import PlayerProfileHub from './PlayerProfileHub.tsx';
import CanonicalPremiumPlayerProfile from './CanonicalPremiumPlayerProfile.tsx';
import { PlayerProfileReminder } from './PlayerProfileCompleteness.tsx';
import PlayerQuickAccessBar from './PlayerQuickAccessBar.tsx';
import PlayerSettingsHub from './PlayerSettingsHub.tsx';
import PlayerSmartNotifications, { type PlayerNotificationDestination } from './PlayerSmartNotifications.tsx';
import PlayerWalletHub from './PlayerWalletHub.tsx';
import PlayerPoker from './PlayerPoker.tsx';
import {
  PLAYER_NAV_SECTION,
  isPlayerCommunitySection,
  isPlayerEveningSection,
  normalizePlayerCabinetSection,
  type PlayerCabinetSection,
} from './playerCabinetNavigation.ts';

export type { PlayerCabinetSection } from './playerCabinetNavigation.ts';

type Props = {
  data: PlayerMeResponse;
  canOpenAdmin?: boolean;
  /** «Проводит вечера»: shows the switch to the limited cabinet only. */
  canOpenEventHost?: boolean;
  onOpenAdmin?: () => void;
  initialSection?: PlayerCabinetSection;
  initialTarget?: string | null;
  onSectionChange?: (section: PlayerCabinetSection, target?: string | null) => void;
};

const profileTabFromTarget = (target: string | null | undefined) => target?.startsWith('tab:') ? target.slice('tab:'.length) || null : null;
const profilePlayerIdFromTarget = (target: string | null | undefined) => target?.startsWith('player:') ? target.slice('player:'.length) || null : null;

export default function PlayerCabinetShell({ data, canOpenAdmin = false, canOpenEventHost = false, onOpenAdmin, initialSection = 'home', initialTarget = null, onSectionChange }: Props) {
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
    // Personal Elo history is the «Elo» tab of the profile (old links and notifications say «elo»).
    // A notification may carry the game key as its target; the Elo journey itself is always the profile tab.
    const nextTarget = requested === 'elo' && !target?.startsWith('tab:') ? 'tab:elo' : target;
    setSection(next);
    onSectionChange?.(next, nextTarget);
  };
  const handleNotificationNavigation = (destination: PlayerNotificationDestination, target?: string | null) => open(destination as PlayerCabinetSection, target || null);
  const currentData = { ...data, player };

  if (section === 'poker') return <PlayerPoker onExit={() => open('club')} />;

  return (
    <div data-testid="player-cabinet-shell" className="player-events-shell player-cabinet-shell min-h-[var(--tg-viewport-stable-height,100dvh)] bg-background text-foreground">
      <PlayerQuickAccessBar player={player} tokenBalance={tokenBalance} active={section === 'wallet' ? 'wallet' : section === 'settings' ? 'settings' : null} canOpenAdmin={canOpenAdmin || canOpenEventHost} onOpenAdmin={onOpenAdmin} onOpenWallet={() => open('wallet')} onOpenSettings={() => open('settings')} />
      <PlayerSmartNotifications onNavigate={handleNotificationNavigation} />
      <div className="h-14" aria-hidden="true" />
      {/* Only on «Главная»: on every section it pushed the content down (owner, 2026-10-06). */}
      {section === 'home' ? <PlayerProfileReminder playerId={player.id} onOpenProfile={() => open('settings')} /> : null}
      <div data-testid="player-live-status-slot" className={`player-live-status-slot ${section === 'home' ? '' : 'player-live-status-slot--compact'}`}><PlayerLiveOnlyCenter compact={section !== 'home'} /></div>

      {section === 'home' ? (
        <PlayerHomeDashboard data={currentData} onOpenEvents={(eventId) => open('events', eventId || null)} onOpenGames={() => open('games')} onOpenMyGames={() => open('games')} onOpenRating={() => open('rating')} onOpenWallet={() => open('wallet')} onOpenLearning={() => open('profile', 'tab:learning')} />
      ) : isPlayerEveningSection(section) ? (
        <PlayerEveningsHub data={currentData} section={section as PlayerEveningsSection} target={initialTarget} onOpen={(next, target) => open(next, target || null)} />
      ) : isPlayerCommunitySection(section) ? (
        <PlayerCommunityHub data={currentData} section={section as CommunitySection} onOpen={(next) => open(next)} onOpenPoker={() => open('poker')} onOpenProfileElo={() => open('profile', 'tab:elo')} />
      ) : section === 'wallet' ? (
        <PlayerWalletHub data={currentData} tokenBalance={tokenBalance} onBalanceChange={setTokenBalance} />
      ) : section === 'profile' ? (
        <PlayerProfileHub data={currentData} initialTab={profileTabFromTarget(initialTarget)} />
      ) : section === 'settings' ? (
        <PlayerSettingsHub data={currentData} onPlayerChange={setPlayer} />
      ) : section === 'conduct' ? (
        <PlayerConductCenter data={currentData} canOpenAdmin={canOpenAdmin} initialPane={initialTarget === 'music' ? 'music' : 'games'} onPaneChange={(pane) => open('conduct', pane === 'music' ? 'music' : null)} />
      ) : (
        <PlayerHomeDashboard data={currentData} onOpenEvents={(eventId) => open('events', eventId || null)} onOpenGames={() => open('games')} onOpenMyGames={() => open('games')} onOpenRating={() => open('rating')} onOpenWallet={() => open('wallet')} onOpenLearning={() => open('profile', 'tab:learning')} />
      )}

      <PlayerBottomNavigation section={section} onOpen={(next) => open(PLAYER_NAV_SECTION[next])} />

      {profilePlayerId ? (
        <div data-testid="canonical-player-profile-overlay" className="fixed inset-0 z-[90] overflow-hidden bg-[#090a0d]">
          <CanonicalPremiumPlayerProfile playerId={profilePlayerId} mode={profilePlayerId === player.id ? 'self' : 'public'} selfPlayerId={player.id} onClose={() => window.history.back()} />
          {/* The overlay covers the cabinet, so it carries the same menu: a section opens and the profile closes (the target resets). */}
          <PlayerBottomNavigation section={section} onOpen={(next) => open(PLAYER_NAV_SECTION[next])} />
        </div>
      ) : null}
    </div>
  );
}
