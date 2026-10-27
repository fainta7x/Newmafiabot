import { confirmPageLeave } from '../../lib/pageLeave.ts';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerBottomNavigation from './PlayerBottomNavigation.tsx';
import PlayerCommunityHub, { type CommunitySection } from './PlayerCommunityHub.tsx';
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
import {
  PLAYER_NAV_SECTION,
  isPlayerCommunitySection,
  isPlayerEveningSection,
  normalizePlayerCabinetSection,
  type PlayerCabinetSection,
} from './playerCabinetNavigation.ts';

export type { PlayerCabinetSection } from './playerCabinetNavigation.ts';

// Heavy sections few players open load on demand: the judge's game screen (engine, protocols) and the mini-games.
const PlayerConductCenter = lazy(() => import('./PlayerConductCenter.tsx'));
const PlayerPoker = lazy(() => import('./PlayerPoker.tsx'));
const PlayerClocktower = lazy(() => import('./PlayerClocktower.tsx'));

type Props = {
  data: PlayerMeResponse;
  canOpenAdmin?: boolean;
  /** Opens an organizer CRM screen by path (for example back to «Ещё → Музыкальная база»). */
  onOpenAdminAt?: (path: string) => void;
  /** «Проводит вечера»: shows the switch to the limited cabinet only. */
  canOpenEventHost?: boolean;
  onOpenAdmin?: () => void;
  initialSection?: PlayerCabinetSection;
  initialTarget?: string | null;
  onSectionChange?: (section: PlayerCabinetSection, target?: string | null) => void;
};

const profileTabFromTarget = (target: string | null | undefined) => target?.startsWith('tab:') ? target.slice('tab:'.length) || null : null;
const profilePlayerIdFromTarget = (target: string | null | undefined) => target?.startsWith('player:') ? target.slice('player:'.length) || null : null;

export default function PlayerCabinetShell({ data, canOpenAdmin = false, canOpenEventHost = false, onOpenAdmin, onOpenAdminAt, initialSection = 'home', initialTarget = null, onSectionChange }: Props) {
  const initialProfilePlayerId = profilePlayerIdFromTarget(initialTarget);
  const [section, setSection] = useState<PlayerCabinetSection>(() => initialProfilePlayerId ? 'club' : normalizePlayerCabinetSection(initialSection));
  const target = initialTarget;
  const [player, setPlayer] = useState(data.player);
  const [tokenBalance, setTokenBalance] = useState(Number(data.player.tokens || 0));
  const profilePlayerId = profilePlayerIdFromTarget(target);


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
    if (!confirmPageLeave()) return;
    const next = normalizePlayerCabinetSection(requested);
    // Personal Elo history is the «Elo» tab of the profile (old links and notifications say «elo»).
    // A notification may carry the game key as its target; the Elo journey itself is always the profile tab.
    const nextTarget = requested === 'elo' && !target?.startsWith('tab:') ? 'tab:elo' : target;
    setSection(next);
    onSectionChange?.(next, nextTarget);
  };
  const handleNotificationNavigation = (destination: PlayerNotificationDestination, target?: string | null) => open(destination as PlayerCabinetSection, target || null);
  const currentData = { ...data, player };
  // The button is for everybody who can conduct: a judge with a mark, and an organizer (the screen holds the music too).
  const canOpenConduct = player.judge_level !== 'none' || canOpenAdmin || player.club_role === 'organizer';

  if (section === 'clocktower') return <PlayerClocktower initialRoomId={initialTarget} onExit={() => open('club', 'games')} onOpenRules={() => { window.location.assign('/guide?tab=clocktower'); }} onOpenRoom={(roomId) => open('clocktower', roomId)} />;
  if (section === 'poker') return <PlayerPoker initialLobbyId={initialTarget} onExit={() => open('club', 'games')} onTokenBalanceChange={setTokenBalance} />;

  return (
    <div data-testid="player-cabinet-shell" className="player-events-shell player-cabinet-shell min-h-[var(--tg-viewport-stable-height,100dvh)] bg-background text-foreground">
      <PlayerQuickAccessBar player={player} tokenBalance={tokenBalance} active={section === 'wallet' ? 'wallet' : section === 'settings' ? 'settings' : null} canOpenAdmin={canOpenAdmin || canOpenEventHost} canOpenConduct={canOpenConduct} onOpenAdmin={onOpenAdmin} onOpenConduct={() => open('conduct')} onOpenWallet={() => open('wallet')} onOpenSettings={() => open('settings')} onOpenHome={() => open('home')} />
      <PlayerSmartNotifications onNavigate={handleNotificationNavigation} />
      <div className="h-14" aria-hidden="true" />
      {/* Only on «Главная»: on every section it pushed the content down (owner, 2026-10-06). */}
      {section === 'home' ? <PlayerProfileReminder playerId={player.id} onOpenProfile={() => open('settings')} /> : null}
      <div data-testid="player-live-status-slot" className={`player-live-status-slot ${section === 'home' ? '' : 'player-live-status-slot--compact'}`}><PlayerLiveOnlyCenter compact={section !== 'home'} /></div>

      {section === 'home' ? (
        <PlayerHomeDashboard data={currentData} onOpenEvents={(eventId) => open('events', eventId || null)} onOpenGames={() => open('games')} onOpenMyGames={() => open('games')} onOpenGame={(gameKey) => open('games', gameKey)} onOpenRating={() => open('rating')} onOpenWallet={() => open('wallet')} onOpenLearning={() => open('profile', 'tab:learning')} />
      ) : isPlayerEveningSection(section) ? (
        <PlayerEveningsHub data={currentData} section={section as PlayerEveningsSection} target={target} onOpen={(next, target) => open(next, target || null)} onOpenPoker={(tableId) => open('poker', tableId || null)} />
      ) : isPlayerCommunitySection(section) ? (
        <PlayerCommunityHub data={currentData} section={section as CommunitySection} target={target} onOpen={open} onOpenPoker={() => open('poker')} onOpenClocktower={() => open('clocktower')} onOpenProfileElo={() => open('profile', 'tab:elo')} />
      ) : section === 'wallet' ? (
        <PlayerWalletHub data={currentData} target={target} onOpen={(view) => open('wallet', view)} tokenBalance={tokenBalance} onBalanceChange={setTokenBalance} />
      ) : section === 'profile' ? (
        <PlayerProfileHub data={currentData} initialTab={profileTabFromTarget(target)} />
      ) : section === 'settings' ? (
        <PlayerSettingsHub data={currentData} onPlayerChange={setPlayer} />
      ) : section === 'conduct' ? (
        <Suspense fallback={<p data-testid="player-section-loading" className="px-4 py-10 text-center text-sm text-muted-foreground">Загружаем раздел…</p>}>
          <PlayerConductCenter data={currentData} canOpenAdmin={canOpenAdmin} onBackToCrm={canOpenAdmin && onOpenAdminAt ? () => onOpenAdminAt('/admin/more/music') : undefined} initialPane={target === 'music' ? 'music' : 'games'} onPaneChange={(pane) => open('conduct', pane === 'music' ? 'music' : null)} />
        </Suspense>
      ) : (
        <PlayerHomeDashboard data={currentData} onOpenEvents={(eventId) => open('events', eventId || null)} onOpenGames={() => open('games')} onOpenMyGames={() => open('games')} onOpenGame={(gameKey) => open('games', gameKey)} onOpenRating={() => open('rating')} onOpenWallet={() => open('wallet')} onOpenLearning={() => open('profile', 'tab:learning')} />
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
