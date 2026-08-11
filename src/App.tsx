import { useCallback, useEffect, useState } from "react";
import OrganizerCRM from "./components/OrganizerCRM.tsx";
import { PublicJoinView } from "./components/public/PublicJoinView.tsx";
import { PublicTournamentResults } from "./components/public/PublicTournamentResults.tsx";
import type { PlayerMeResponse } from "./components/player/PlayerCabinet.tsx";
import PlayerCabinetV2 from "./components/player/PlayerCabinetV2.tsx";

type RootState =
  | { status: 'loading' }
  | { status: 'player'; data: PlayerMeResponse; canOpenAdmin: boolean }
  | { status: 'unlinked'; canOpenAdmin: boolean }
  | { status: 'error' };

function getTelegramInitData(): string {
  const telegramWebApp = (window as any).Telegram?.WebApp;
  return typeof telegramWebApp?.initData === 'string' ? telegramWebApp.initData : '';
}

function RootMessage({
  title,
  text,
  onRetry,
  canOpenAdmin = false,
}: {
  title: string;
  text: string;
  onRetry?: () => void;
  canOpenAdmin?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090a0d] px-5 text-white">
      <div className="w-full max-w-[390px] rounded-3xl border border-white/10 bg-white/[0.045] p-5 text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div>
        <h1 className="mt-3 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-white/50">{text}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-white"
          >
            Повторить
          </button>
        )}
        {canOpenAdmin && (
          <a
            href="/admin"
            className="mt-3 block w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white/80"
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

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const isJoinRoute = pathname.startsWith('/join');
  const isTournamentResultsRoute = pathname.startsWith('/tournaments/results/');
  const isPublicRoute = isJoinRoute || isTournamentResultsRoute;
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const telegramInitData = getTelegramInitData();
  const isPlayerContext = pathname === '/player' || pathname.startsWith('/player/') || (pathname === '/' && Boolean(telegramInitData));

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
          body: JSON.stringify({ initData }),
        });
        if (!telegramResponse.ok) throw new Error('telegram-auth');
      }

      const sessionResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!sessionResponse.ok) throw new Error('session');
      const session = await sessionResponse.json();
      const canOpenAdmin = session?.isOrganizer === true;

      if (session?.linked === true) {
        const profileResponse = await fetch('/api/player/me', { credentials: 'same-origin' });
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

  if (isAdminRoute || !isPlayerContext) {
    return <OrganizerCRM />;
  }

  if (rootState.status === 'loading') {
    return <RootMessage title="Загружаем профиль" text="Проверяем вход через Telegram…" />;
  }

  if (rootState.status === 'unlinked') {
    return (
      <RootMessage
        title="Профиль не привязан"
        text="Этот Telegram-аккаунт пока не привязан к профилю игрока. Обратитесь к организатору клуба."
        canOpenAdmin={rootState.canOpenAdmin}
      />
    );
  }

  if (rootState.status === 'error') {
    return <RootMessage title="Не удалось войти" text="Не получилось подтвердить сессию или загрузить профиль. Попробуйте ещё раз." onRetry={() => void bootstrapPlayer()} />;
  }

  return <PlayerCabinetV2 data={rootState.data} canOpenAdmin={rootState.canOpenAdmin} />;
}
