import { useCallback, useEffect, useMemo, useState } from "react";
import BettingLiveBridge from "./components/BettingLiveBridge.tsx";
import OrganizerCRM from "./components/OrganizerCRM.tsx";
import BigScreenLive from "./components/public/BigScreenLive.tsx";
import LiveBroadcastOverlay from "./components/public/LiveBroadcastOverlay.tsx";
import { PublicJoinView } from "./components/public/PublicJoinView.tsx";
import { PublicTournamentResults } from "./components/public/PublicTournamentResults.tsx";
import PlayerCabinetShell, { type PlayerCabinetSection } from "./components/player/PlayerCabinetShell.tsx";
import PlayerReplayScreen from "./components/player/PlayerReplayScreen.tsx";
import VerifiedPlayerOnboarding from "./components/player/VerifiedPlayerOnboarding.tsx";
import AsyncState from "./components/ui/AsyncState.tsx";
import { appBackTarget, isRoutePrefix, parsePlayerRoute, playerPathForSection, type PlayerRouteSection } from "./lib/appNavigation.ts";
import type { PlayerMeResponse } from "./types/player.ts";

type RootState =
  | { status: 'loading' }
  | { status: 'player'; data: PlayerMeResponse; canOpenAdmin: boolean }
  | { status: 'unlinked'; canOpenAdmin: boolean }
  | { status: 'error' };

function getTelegramInitData(): string {
  const telegramWebApp = (window as any).Telegram?.WebApp;
  return typeof telegramWebApp?.initData === 'string' ? telegramWebApp.initData : '';
}

function currentPlayerReturnPath() {
  const url = new URL(window.location.href);
  if (url.pathname !== '/player' && !url.pathname.startsWith('/player/')) return '/player';
  return `${url.pathname}${url.search}${url.hash}` || '/player';
}

function RootMessage({
  title,
  text,
  onRetry,
  canOpenAdmin = false,
  kind = 'error',
}: {
  title: string;
  text: string;
  onRetry?: () => void;
  canOpenAdmin?: boolean;
  kind?: 'loading' | 'error' | 'empty';
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090a0d] px-5 text-white">
      <div className="w-full max-w-[390px]">
        <div className="mb-3 text-center text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div>
        <AsyncState
          kind={kind}
          title={title}
          description={text}
          actionLabel="Повторить"
          onAction={onRetry}
        />
        {canOpenAdmin && (
          <a
            href="/admin"
            className="mt-3 block w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-center text-sm font-medium text-white/80"
          >
            Панель организатора
          </a>
        )}
      </div>
    </main>
  );
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [rootState, setRootState] = useState<RootState>({ status: 'loading' });

  const navigatePath = useCallback((nextPath: string, replace = false) => {
    if (window.location.pathname === nextPath) {
      setPathname(nextPath);
      return;
    }
    if (replace) window.history.replaceState({}, '', nextPath);
    else window.history.pushState({}, '', nextPath);
    setPathname(nextPath);
  }, []);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const backButton = (window as any).Telegram?.WebApp?.BackButton;
    if (!backButton) return;
    const target = appBackTarget(pathname);
    if (!target) {
      backButton.hide?.();
      return;
    }
    const handleBack = () => navigatePath(target, true);
    backButton.show?.();
    backButton.onClick?.(handleBack);
    return () => backButton.offClick?.(handleBack);
  }, [navigatePath, pathname]);

  const isJoinRoute = isRoutePrefix(pathname, '/join');
  const isTournamentResultsRoute = isRoutePrefix(pathname, '/tournaments/results');
  const isLiveRoute = isRoutePrefix(pathname, '/live');
  const isBroadcastRoute = isRoutePrefix(pathname, '/broadcast');
  const isPublicRoute = isJoinRoute || isTournamentResultsRoute || isLiveRoute || isBroadcastRoute;
  const isAdminRoute = isRoutePrefix(pathname, '/admin');
  const telegramInitData = getTelegramInitData();
  const isPlayerContext = isRoutePrefix(pathname, '/player') || (pathname === '/' && Boolean(telegramInitData));
  const parsedPlayerRoute = useMemo(() => parsePlayerRoute(pathname), [pathname]);

  useEffect(() => {
    if (!isRoutePrefix(pathname, '/player')) return;
    if (parsedPlayerRoute.canonicalPath !== pathname) navigatePath(parsedPlayerRoute.canonicalPath, true);
  }, [navigatePath, parsedPlayerRoute.canonicalPath, pathname]);

  const bootstrapPlayer = useCallback(async () => {
    if (isPublicRoute || isAdminRoute || !isPlayerContext) return;
    setRootState({ status: 'loading' });

    const telegramWebApp = (window as any).Telegram?.WebApp;
    const initData = getTelegramInitData();

    if (telegramWebApp) {
      try {
        telegramWebApp.ready?.();
        telegramWebApp.expand?.();
      } catch {}
    }

    try {
      if (initData) {
        const telegramResponse = await fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({ initData, return_to: currentPlayerReturnPath() }),
        });
        if (!telegramResponse.ok) throw new Error('telegram-auth');
      }

      const sessionResponse = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!sessionResponse.ok) throw new Error('session');
      const session = await sessionResponse.json();
      const canOpenAdmin = session?.isOrganizer === true;

      if (session?.linked === true) {
        const profileResponse = await fetch('/api/player/me', { credentials: 'same-origin', cache: 'no-store' });
        if (!profileResponse.ok) throw new Error('player-profile');
        const data = await profileResponse.json() as PlayerMeResponse;
        setRootState({ status: 'player', data, canOpenAdmin });
        return;
      }

      setRootState({ status: 'unlinked', canOpenAdmin });
    } catch {
      setRootState({ status: 'error' });
    }
  }, [isAdminRoute, isPlayerContext, isPublicRoute]);

  useEffect(() => {
    void bootstrapPlayer();
  }, [bootstrapPlayer]);

  if (isJoinRoute) {
    const parts = pathname.split('/').filter(Boolean);
    const eveningId = parts[1] || 'latest';
    return <PublicJoinView eveningId={eveningId} />;
  }

  if (isTournamentResultsRoute) {
    const parts = pathname.split('/').filter(Boolean);
    const token = parts[2] || '';
    return <PublicTournamentResults token={token} />;
  }

  if (isLiveRoute) return <BigScreenLive />;

  if (isBroadcastRoute) {
    const parts = pathname.split('/').filter(Boolean);
    return <LiveBroadcastOverlay token={parts[1] || ''} />;
  }

  if (isAdminRoute || !isPlayerContext) {
    return (
      <>
        <BettingLiveBridge />
        <OrganizerCRM
          pathname={pathname}
          onNavigate={navigatePath}
          onOpenPlayerMode={() => navigatePath('/player')}
        />
      </>
    );
  }

  if (rootState.status === 'loading') {
    return <RootMessage kind="loading" title="Загружаем профиль" text="Проверяем сессию игрока…" />;
  }

  if (rootState.status === 'unlinked') {
    return <VerifiedPlayerOnboarding canOpenAdmin={rootState.canOpenAdmin} />;
  }

  if (rootState.status === 'error') {
    return <RootMessage kind="error" title="Не удалось войти" text="Не получилось подтвердить сессию или загрузить профиль. Попробуйте ещё раз." onRetry={() => void bootstrapPlayer()} />;
  }

  if (parsedPlayerRoute.replayGameKey) {
    return <PlayerReplayScreen gameKey={parsedPlayerRoute.replayGameKey} onBack={() => navigatePath('/player/games')} />;
  }

  const initialSection = parsedPlayerRoute.section as PlayerCabinetSection;
  const initialTarget = parsedPlayerRoute.target;

  const syncPlayerPath = (section: PlayerCabinetSection, target?: string | null) => {
    navigatePath(playerPathForSection(section as PlayerRouteSection, target));
  };

  return (
    <PlayerCabinetShell
      data={rootState.data}
      canOpenAdmin={rootState.canOpenAdmin}
      onOpenAdmin={() => navigatePath('/admin')}
      initialSection={initialSection}
      initialTarget={initialTarget}
      onSectionChange={syncPlayerPath}
    />
  );
}
