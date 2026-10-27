import { confirmPageLeave } from './lib/pageLeave.ts';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BettingLiveBridge from "./components/BettingLiveBridge.tsx";
const OrganizerCRM = lazy(() => import("./components/OrganizerCRM.tsx"));
const BigScreenLive = lazy(() => import("./components/public/BigScreenLive.tsx"));
const LiveBroadcastOverlay = lazy(() => import("./components/public/LiveBroadcastOverlay.tsx"));
const BroadcastCommentatorFrame = lazy(() => import("./components/public/BroadcastCommentatorFrame.tsx"));
const BroadcastLobbyScreen = lazy(() => import("./components/public/BroadcastLobbyScreen.tsx"));
const ObsBridgePage = lazy(() => import("./components/public/ObsBridgePage.tsx"));
import { PublicJoinView } from "./components/public/PublicJoinView.tsx";
import { PublicTournamentResults } from "./components/public/PublicTournamentResults.tsx";
import { PublicOffer } from "./components/public/PublicOffer.tsx";
import TelegramLinkRedeem from "./components/player/TelegramLinkRedeem.tsx";
const PublicGuideRoute = lazy(() => import("./components/public/PublicGuideRoute.tsx"));
import PlayerCabinetShell, { type PlayerCabinetSection } from "./components/player/PlayerCabinetShell.tsx";
const PlayerReplayScreen = lazy(() => import("./components/player/PlayerReplayScreen.tsx"));
import VerifiedPlayerOnboarding from "./components/player/VerifiedPlayerOnboarding.tsx";
import AsyncState from "./components/ui/AsyncState.tsx";
import { appBackTarget, isRoutePrefix, parsePlayerRoute, playerPathForSection, type PlayerRouteSection } from "./lib/appNavigation.ts";
import type { PlayerMeResponse } from "./types/player.ts";
import { MAINTENANCE_TEXT, MAINTENANCE_TITLE, ServerRestartingError, fetchOrRestarting, isRestartingStatus, maintenanceContacts } from './lib/maintenance.ts';

type RootState =
  | { status: 'loading' }
  | { status: 'player'; data: PlayerMeResponse; canOpenAdmin: boolean; canOpenEventHost?: boolean }
  | { status: 'unlinked'; canOpenAdmin: boolean }
  | { status: 'error' }
  | { status: 'restarting' };

function getTelegramInitData(): string {
  const telegramWebApp = (window as any).Telegram?.WebApp;
  return typeof telegramWebApp?.initData === 'string' ? telegramWebApp.initData : '';
}

function currentPlayerReturnPath() {
  const url = new URL(window.location.href);
  if (url.pathname !== '/player' && !url.pathname.startsWith('/player/')) return '/player';
  return `${url.pathname}${url.search}${url.hash}` || '/player';
}

function MaintenanceScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main data-testid="maintenance-screen" className="flex min-h-screen items-center justify-center bg-[#090a0d] px-5 text-white">
      <div className="w-full max-w-[390px] rounded-3xl border border-white/10 bg-white/[0.045] p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-white/40">2LA Noire</div>
        <h1 className="mt-2 text-[22px] font-semibold">{MAINTENANCE_TITLE}</h1>
        <p className="mt-2 text-sm leading-6 text-white/65">{MAINTENANCE_TEXT}</p>
        <button type="button" onClick={onRetry} className="mt-4 min-h-12 w-full rounded-2xl bg-white px-4 text-sm font-bold text-black">Попробовать снова</button>
        <p className="mt-4 text-sm text-white/55">По всем вопросам пишите организатору:</p>
        {maintenanceContacts().map((contact) => (
          <a key={contact.url} href={contact.url} target="_blank" rel="noreferrer" className="mt-2 block min-h-11 rounded-2xl bg-white/[0.08] px-4 py-3 text-center text-sm font-semibold text-white">{contact.label}</a>
        ))}
      </div>
    </main>
  );
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
  return <Suspense fallback={<RootMessage title="Загружаем раздел…" kind="loading" text="" />}><AppContent /></Suspense>;
}

function AppContent() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const currentPage = useRef({ url: `${window.location.pathname}${window.location.search}${window.location.hash}`, state: window.history.state, index: Number(window.history.state?.pageLeaveIndex) || 0 });
  const restoringHistory = useRef(false);
  useEffect(() => {
    const state = { ...window.history.state, pageLeaveIndex: currentPage.current.index };
    window.history.replaceState(state, '', currentPage.current.url);
    currentPage.current.state = state;
  }, []);
  const [search, setSearch] = useState(() => window.location.search);
  const [rootState, setRootState] = useState<RootState>({ status: 'loading' });
  const [loadingSlow, setLoadingSlow] = useState(false);

  useEffect(() => {
    if (rootState.status !== 'loading') {
      setLoadingSlow(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setLoadingSlow(true), 6_000);
    return () => window.clearTimeout(timer);
  }, [rootState.status]);

  const navigatePath = useCallback((nextPath: string, replace = false) => {
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current === nextPath || !confirmPageLeave(nextPath)) return;
    const index = currentPage.current.index + (replace ? 0 : 1);
    const state = { ...(replace ? window.history.state : {}), pageLeaveIndex: index };
    if (replace) window.history.replaceState(state, '', nextPath);
    else window.history.pushState(state, '', nextPath);
    currentPage.current = { url: `${window.location.pathname}${window.location.search}${window.location.hash}`, state, index };
    setPathname(window.location.pathname);
    setSearch(window.location.search);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (restoringHistory.current) { restoringHistory.current = false; return; }
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const previous = currentPage.current;
      const index = window.history.state?.pageLeaveIndex;
      if (!confirmPageLeave(next)) {
        if (typeof index === 'number' && index !== previous.index) {
          restoringHistory.current = true;
          window.history.go(previous.index - index);
        } else {
          // A legacy/shared link may not carry our index. Keep the edited page open.
          window.history.pushState(previous.state, '', previous.url);
        }
        return;
      }
      currentPage.current = { url: next, state: window.history.state, index: typeof index === 'number' ? index : previous.index };
      setPathname(window.location.pathname); setSearch(window.location.search);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const backButton = (window as any).Telegram?.WebApp?.BackButton;
    // PublicGuide owns Telegram Back inside /guide; attaching App's handler as well
    // caused the same tap to compete with the guide's internal lesson history.
    if (!backButton || isRoutePrefix(pathname, '/guide')) return;
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
  const isGuideRoute = isRoutePrefix(pathname, '/guide');
  const isObsBridgeRoute = isRoutePrefix(pathname, '/obs-bridge');
  const isOfferRoute = isRoutePrefix(pathname, '/offer');
  const isPublicRoute = isOfferRoute || isJoinRoute || isTournamentResultsRoute || isLiveRoute || isBroadcastRoute || isGuideRoute || isObsBridgeRoute;
  const isAdminRoute = isRoutePrefix(pathname, '/admin');
  const telegramInitData = getTelegramInitData();
  const isPlayerContext = isRoutePrefix(pathname, '/player') || (pathname === '/' && Boolean(telegramInitData));
  const parsedPlayerRoute = useMemo(() => parsePlayerRoute(pathname, search), [pathname, search]);

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
        const telegramResponse = await fetchOrRestarting('/api/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({ initData, return_to: currentPlayerReturnPath() }),
        });
        if (isRestartingStatus(telegramResponse.status)) throw new ServerRestartingError();
        if (!telegramResponse.ok) throw new Error('telegram-auth');
      }

      // After Telegram auth the session cookie is already set. These reads are
      // independent, so fetch them together to remove one full mobile round trip.
      const [sessionResponse, profileResponse] = await Promise.all([
        fetchOrRestarting('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' }),
        fetchOrRestarting('/api/player/me', { credentials: 'same-origin', cache: 'no-store' }),
      ]);
      if (isRestartingStatus(sessionResponse.status)) throw new ServerRestartingError();
      if (isRestartingStatus(profileResponse.status)) throw new ServerRestartingError();
      if (!sessionResponse.ok) throw new Error('session');
      const session = await sessionResponse.json();
      const canOpenAdmin = session?.isOrganizer === true;
      // «Проводит вечера»: only the switch to the limited cabinet, none of the organizer powers.
      const canOpenEventHost = !canOpenAdmin && ((Array.isArray(session?.eventHostFormats) && session.eventHostFormats.length > 0) || session?.eventOrganizer === true);

      if (session?.linked === true) {
        if (!profileResponse.ok) throw new Error('player-profile');
        const data = await profileResponse.json() as PlayerMeResponse;
        setRootState({ status: 'player', data, canOpenAdmin, canOpenEventHost });
        return;
      }

      setRootState({ status: 'unlinked', canOpenAdmin });
    } catch (error) {
      // No answer at all (TypeError from fetch) or a gateway error: the server is restarting.
      setRootState({ status: error instanceof ServerRestartingError || error instanceof TypeError ? 'restarting' : 'error' });
    }
  }, [isAdminRoute, isPlayerContext, isPublicRoute]);

  // While restarting, try again every 20 seconds by itself.
  useEffect(() => {
    if (rootState.status !== 'restarting') return undefined;
    const timer = window.setInterval(() => { void bootstrapPlayer(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [bootstrapPlayer, rootState.status]);

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

  if (isOfferRoute) return <PublicOffer />;

  if (isLiveRoute) return <BigScreenLive />;

  if (isGuideRoute) return <PublicGuideRoute onNavigate={navigatePath} />;

  if (isObsBridgeRoute) return <ObsBridgePage />;

  if (isBroadcastRoute) {
    const parts = pathname.split('/').filter(Boolean);
    // The commentators' window frame is static and needs no token.
    if (parts[1] === 'frame') return <BroadcastCommentatorFrame />;
    // «Заставка» and «Итоги» scenes live next to the game overlay under the same secret link.
    if (parts[2] === 'lobby' || parts[2] === 'standings') return <BroadcastLobbyScreen token={parts[1] || ''} view={parts[2]} />;
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
    return <RootMessage kind="loading" title="Загружаем профиль" text={loadingSlow ? 'Сеть отвечает дольше обычного. Ещё немного — затем появится кнопка повтора.' : 'Проверяем вход…'} />;
  }

  if (rootState.status === 'unlinked') {
    return <VerifiedPlayerOnboarding canOpenAdmin={rootState.canOpenAdmin} />;
  }

  if (rootState.status === 'restarting') return <MaintenanceScreen onRetry={() => void bootstrapPlayer()} />;

  if (rootState.status === 'error') {
    return <RootMessage kind="error" title="Не удалось войти" text="Не получилось подтвердить вход или загрузить профиль. Попробуйте ещё раз." onRetry={() => void bootstrapPlayer()} />;
  }

  if (parsedPlayerRoute.replayGameKey) {
    return <PlayerReplayScreen gameKey={parsedPlayerRoute.replayGameKey} onBack={() => { if (window.history.state?.replayFromProtocol) window.history.back(); else navigatePath(playerPathForSection('games', parsedPlayerRoute.replayGameKey), true); }} />;
  }

  const initialSection = parsedPlayerRoute.section as PlayerCabinetSection;
  const initialTarget = parsedPlayerRoute.target;

  const syncPlayerPath = (section: PlayerCabinetSection, target?: string | null) => {
    navigatePath(playerPathForSection(section as PlayerRouteSection, target));
  };

  return (
    <>
    <TelegramLinkRedeem />
    <PlayerCabinetShell
      data={rootState.data}
      canOpenAdmin={rootState.canOpenAdmin}
      canOpenEventHost={rootState.canOpenEventHost}
      onOpenAdmin={() => navigatePath('/admin')}
      onOpenAdminAt={(path) => navigatePath(path)}
      initialSection={initialSection}
      initialTarget={initialTarget}
      onSectionChange={syncPlayerPath}
    />
    </>
  );
}
