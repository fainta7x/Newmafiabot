import { useCallback, useEffect, useState } from "react";
import BettingLiveBridge from "./components/BettingLiveBridge.tsx";
import OrganizerCRM from "./components/OrganizerCRM.tsx";
import { PublicJoinView } from "./components/public/PublicJoinView.tsx";
import { PublicTournamentResults } from "./components/public/PublicTournamentResults.tsx";
import type { PlayerMeResponse } from "./components/player/PlayerCabinet.tsx";
import PlayerCabinetV2 from "./components/player/PlayerCabinetV2.tsx";
import PlayerPayments from "./components/player/PlayerPayments.tsx";

type TelegramIdentity = {
  id: number;
  username: string | null;
  first_name: string | null;
};

type RootState =
  | { status: 'loading' }
  | { status: 'player'; data: PlayerMeResponse; canOpenAdmin: boolean }
  | { status: 'unlinked'; canOpenAdmin: boolean; telegram: TelegramIdentity | null }
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

function PlayerRegistration({
  telegram,
  initData,
  onComplete,
  canOpenAdmin,
}: {
  telegram: TelegramIdentity | null;
  initData: string;
  onComplete: () => void;
  canOpenAdmin: boolean;
}) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!initData || !telegram) {
    return (
      <RootMessage
        title="Откройте через Telegram"
        text="Регистрация игрока подтверждается Telegram-аккаунтом. Откройте приложение из бота клуба и повторите вход."
        canOpenAdmin={canOpenAdmin}
      />
    );
  }

  const submit = async () => {
    const value = nickname.trim().replace(/\s+/g, ' ');
    if (!value) {
      setError('Введите игровой ник.');
      return;
    }
    if (value.length > 60) {
      setError('Игровой ник не должен быть длиннее 60 символов.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ initData, nickname: value }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body?.code === 'nickname_taken') {
          throw new Error('Такой ник уже есть в клубе. Если это ваш старый профиль, не создавайте новый — попросите организатора привязать существующий профиль к вашему Telegram.');
        }
        throw new Error(body?.error || 'Не удалось создать профиль.');
      }
      onComplete();
    } catch (submitError: any) {
      setError(submitError?.message || 'Не удалось создать профиль.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-8 text-white">
      <div className="w-full max-w-[390px] rounded-3xl border border-white/10 bg-white/[0.045] p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div>
        <h1 className="mt-3 text-2xl font-semibold">Создать профиль</h1>
        <p className="mt-2 text-sm leading-6 text-white/50">
          Telegram подтверждён{telegram.first_name ? ` · ${telegram.first_name}` : ''}. Осталось выбрать игровой ник — под ним вы будете отображаться в записях, играх, рейтингах и турнирах.
        </p>

        <label className="mt-5 block text-xs font-medium uppercase tracking-[0.14em] text-white/35">Игровой ник</label>
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={60}
          autoFocus
          placeholder="Например: Матроскина"
          className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-base text-white outline-none placeholder:text-white/20 focus:border-white/25"
        />

        {error && <div className="mt-3 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm leading-5 text-rose-100/80">{error}</div>}

        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-4 min-h-12 w-full rounded-2xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? 'Создаём профиль…' : 'Зарегистрироваться'}
        </button>

        <div className="mt-4 rounded-2xl border border-amber-200/10 bg-amber-200/[0.04] px-3 py-3 text-xs leading-5 text-amber-50/50">
          Уже играли в 2LA noire? Если ваш профиль уже есть в клубной базе, не создавайте второй — обратитесь к организатору для привязки Telegram.
        </div>

        {canOpenAdmin && (
          <a href="/admin" className="mt-3 block text-center text-xs text-white/35">Открыть панель организатора</a>
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

  const navigatePlayer = (path: string) => {
    window.history.pushState({}, '', path);
    setPathname(path);
  };

  const bootstrapPlayer = useCallback(async () => {
    if (isPublicRoute || isAdminRoute || !isPlayerContext) return;
    setRootState({ status: 'loading' });

    const telegramWebApp = (window as any).Telegram?.WebApp;
    const initData = getTelegramInitData();
    let telegramIdentity: TelegramIdentity | null = null;

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
        const telegramBody = await telegramResponse.json().catch(() => ({}));
        if (!telegramResponse.ok) throw new Error('telegram-auth');
        telegramIdentity = {
          id: Number(telegramBody?.id || 0),
          username: telegramBody?.username ?? null,
          first_name: telegramBody?.first_name ?? null,
        };
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

      setRootState({ status: 'unlinked', canOpenAdmin, telegram: telegramIdentity });
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
    return <><BettingLiveBridge /><OrganizerCRM /></>;
  }

  if (rootState.status === 'loading') {
    return <RootMessage title="Загружаем профиль" text="Проверяем вход через Telegram…" />;
  }

  if (rootState.status === 'unlinked') {
    return (
      <PlayerRegistration
        telegram={rootState.telegram}
        initData={telegramInitData}
        onComplete={() => void bootstrapPlayer()}
        canOpenAdmin={rootState.canOpenAdmin}
      />
    );
  }

  if (rootState.status === 'error') {
    return <RootMessage title="Не удалось войти" text="Не получилось подтвердить сессию или загрузить профиль. Попробуйте ещё раз." onRetry={() => void bootstrapPlayer()} />;
  }

  if (pathname.startsWith('/player/payments')) {
    return <main className="min-h-screen bg-[#090a0d] px-3 pb-8 pt-3 text-white"><PlayerPayments onBack={() => navigatePlayer('/player')} /></main>;
  }

  return (
    <>
      <PlayerCabinetV2 data={rootState.data} canOpenAdmin={rootState.canOpenAdmin} />
      <button
        type="button"
        onClick={() => navigatePlayer('/player/payments')}
        className="fixed bottom-[104px] right-3 z-40 rounded-2xl border border-white/10 bg-[#1b1c21]/95 px-3 py-2 text-xs font-semibold text-white/75 shadow-xl backdrop-blur"
      >
        ₽ Оплата
      </button>
    </>
  );
}
