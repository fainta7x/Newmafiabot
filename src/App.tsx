import { useCallback, useEffect, useState } from "react";
import OrganizerCRM from "./components/OrganizerCRM.tsx";
import { PublicJoinView } from "./components/public/PublicJoinView.tsx";
import { PublicTournamentResults } from "./components/public/PublicTournamentResults.tsx";
import PlayerCabinet, { type PlayerMeResponse } from "./components/player/PlayerCabinet.tsx";

type RootState =
  | { status: 'loading' }
  | { status: 'organizer' }
  | { status: 'player'; data: PlayerMeResponse }
  | { status: 'unlinked' }
  | { status: 'error' };

function RootMessage({
  title,
  text,
  onRetry,
}: {
  title: string;
  text: string;
  onRetry?: () => void;
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

  const isPublicRoute = pathname.startsWith('/join') || pathname.startsWith('/tournaments/results/');

  const bootstrap = useCallback(async () => {
    if (isPublicRoute) return;
    setRootState({ status: 'loading' });

    const telegramWebApp = (window as any).Telegram?.WebApp;
    let initData = '';
    let telegramAuthenticated = false;

    if (telegramWebApp) {
      try {
        telegramWebApp.ready?.();
        telegramWebApp.expand?.();
      } catch {}
      initData = typeof telegramWebApp.initData === 'string' ? telegramWebApp.initData : '';
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
        telegramAuthenticated = true;
      }

      const sessionResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!sessionResponse.ok) throw new Error('session');
      const session = await sessionResponse.json();

      if (session?.isOrganizer === true) {
        setRootState({ status: 'organizer' });
        return;
      }

      if (session?.linked === true) {
        const profileResponse = await fetch('/api/player/me', { credentials: 'same-origin' });
        if (!profileResponse.ok) throw new Error('player-profile');
        const data = await profileResponse.json() as PlayerMeResponse;
        setRootState({ status: 'player', data });
        return;
      }

      if (initData && telegramAuthenticated) {
        setRootState({ status: 'unlinked' });
        return;
      }

      setRootState({ status: 'organizer' });
    } catch {
      setRootState({ status: 'error' });
    }
  }, [isPublicRoute]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (pathname.startsWith('/join')) {
    const parts = pathname.split('/').filter(Boolean);
    const eveningId = parts[1] || 'latest';
    return <PublicJoinView eveningId={eveningId} />;
  }

  if (pathname.startsWith('/tournaments/results/')) {
    const parts = pathname.split('/').filter(Boolean);
    const token = parts[2] || '';
    return <PublicTournamentResults token={token} />;
  }

  if (rootState.status === 'loading') {
    return <RootMessage title="Загружаем профиль" text="Проверяем вход через Telegram…" />;
  }

  if (rootState.status === 'unlinked') {
    return <RootMessage title="Профиль не привязан" text="Этот Telegram-аккаунт пока не привязан к профилю игрока. Обратитесь к организатору клуба." />;
  }

  if (rootState.status === 'error') {
    return <RootMessage title="Не удалось войти" text="Не получилось подтвердить сессию или загрузить профиль. Попробуйте ещё раз." onRetry={() => void bootstrap()} />;
  }

  if (rootState.status === 'player') {
    return <PlayerCabinet data={rootState.data} />;
  }

  return <OrganizerCRM />;
}
