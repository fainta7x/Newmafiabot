import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Lock, Menu, RefreshCw, Users } from 'lucide-react';
import { api, type CrmOverview, type GameEvening, type Player } from '../lib/api.ts';
import { CRMOverview } from './crm/CRMOverview.tsx';
import { EveningsList } from './crm/EveningsList.tsx';
import { EveningWorkspace, type EveningSection } from './crm/EveningWorkspace.tsx';
import { MoreCRM } from './crm/MoreCRM.tsx';
import { PlayersCRM } from './crm/PlayersCRM.tsx';
import { TasksCRM } from './crm/TasksCRM.tsx';
import { AnalyticsCRM } from './crm/AnalyticsCRM.tsx';
import { ThemeSelectorModal } from './crm/ThemeSelectorModal.tsx';
import { initTheme, type ThemeId } from '../lib/theme.ts';
import { useMobileKeyboardViewport } from '../hooks/useMobileKeyboardViewport.ts';
import { ORGANIZER_PRIMARY_NAV, type OrganizerPrimaryTab } from '../lib/organizerUx.ts';

interface OrganizerCRMProps {
  onReturnToGameEngine?: () => void;
  pathname?: string;
  onNavigate?: (path: string, replace?: boolean) => void;
}

type MainTab = OrganizerPrimaryTab | 'tasks' | 'analytics';

type OrganizerRouteState = {
  tab: MainTab;
  eveningId: string | null;
  eveningSection: EveningSection;
  playerId: string | null;
};

type PlayerReturnContext = {
  tab: MainTab;
  eveningId: string | null;
  eveningSection: EveningSection;
  scrollY: number;
} | null;

const EVENING_SECTIONS = new Set<EveningSection>(['overview', 'participants', 'tables', 'games']);

const safeDecode = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseOrganizerRoute = (pathname: string): OrganizerRouteState => {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'admin') {
    return { tab: 'overview', eveningId: null, eveningSection: 'overview', playerId: null };
  }

  if (parts[1] === 'evenings') {
    const eveningId = safeDecode(parts[2]);
    const section = EVENING_SECTIONS.has(parts[3] as EveningSection)
      ? parts[3] as EveningSection
      : 'overview';
    return { tab: 'evenings', eveningId, eveningSection: section, playerId: null };
  }

  if (parts[1] === 'players') {
    return {
      tab: 'players',
      eveningId: null,
      eveningSection: 'overview',
      playerId: safeDecode(parts[2]),
    };
  }

  if (parts[1] === 'tasks') {
    return { tab: 'tasks', eveningId: null, eveningSection: 'overview', playerId: null };
  }

  if (parts[1] === 'analytics') {
    return { tab: 'analytics', eveningId: null, eveningSection: 'overview', playerId: null };
  }

  if (parts[1] === 'more') {
    return { tab: 'more', eveningId: null, eveningSection: 'overview', playerId: null };
  }

  return { tab: 'overview', eveningId: null, eveningSection: 'overview', playerId: null };
};

const organizerTabPath = (tab: MainTab): string => {
  if (tab === 'overview') return '/admin';
  if (tab === 'evenings') return '/admin/evenings';
  if (tab === 'players') return '/admin/players';
  if (tab === 'tasks') return '/admin/tasks';
  if (tab === 'analytics') return '/admin/analytics';
  return '/admin/more';
};

const organizerEveningPath = (eveningId: string, section: EveningSection = 'overview'): string => {
  const base = `/admin/evenings/${encodeURIComponent(eveningId)}`;
  return section === 'overview' ? base : `${base}/${section}`;
};

const organizerPlayerPath = (playerId: string): string => `/admin/players/${encodeURIComponent(playerId)}`;

const routePathForReturnContext = (context: NonNullable<PlayerReturnContext>): string => {
  if (context.tab === 'evenings' && context.eveningId) {
    return organizerEveningPath(context.eveningId, context.eveningSection);
  }
  return organizerTabPath(context.tab);
};

const moveWindowScroll = (top: number) => {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: 'auto' }));
};

export const OrganizerCRM: React.FC<OrganizerCRMProps> = ({ onReturnToGameEngine, pathname, onNavigate }) => {
  useMobileKeyboardViewport();

  const [localPathname, setLocalPathname] = useState(() => pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/admin'));
  const routePathname = pathname ?? localPathname;
  const initialRouteRef = useRef<OrganizerRouteState | null>(null);
  if (initialRouteRef.current === null) initialRouteRef.current = parseOrganizerRoute(routePathname);
  const initialRoute = initialRouteRef.current;

  const [activeTab, setActiveTab] = useState<MainTab>(initialRoute.tab);
  const [activeEveningId, setActiveEveningId] = useState<string | null>(initialRoute.eveningId);
  const [activeEveningSection, setActiveEveningSection] = useState<EveningSection>(initialRoute.eveningSection);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(initialRoute.playerId);
  const [playerReturnContext, setPlayerReturnContext] = useState<PlayerReturnContext>(null);
  const [eveningIntent, setEveningIntent] = useState<'add' | 'create' | null>(null);
  const eveningListScrollRef = useRef(0);
  const resumeRefreshTimerRef = useRef<number | null>(null);

  const [isOrganizer, setIsOrganizer] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [currentTheme, setCurrentTheme] = useState<ThemeId>('noir-cherry');
  const [showThemeModal, setShowThemeModal] = useState(false);

  const [crmOverview, setCrmOverview] = useState<CrmOverview | null>(null);
  const [evenings, setEvenings] = useState<GameEvening[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const navigateAdmin = (nextPath: string, replace = false) => {
    if (onNavigate) {
      onNavigate(nextPath, replace);
      return;
    }
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== nextPath) {
      if (replace) window.history.replaceState({}, '', nextPath);
      else window.history.pushState({}, '', nextPath);
    }
    setLocalPathname(nextPath);
  };

  useEffect(() => {
    if (pathname !== undefined || typeof window === 'undefined') return;
    const handlePopState = () => setLocalPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [pathname]);

  useEffect(() => {
    const route = parseOrganizerRoute(routePathname);
    setActiveTab(route.tab);
    setActiveEveningId(route.eveningId);
    setActiveEveningSection(route.eveningSection);
    setActivePlayerId(route.playerId);
  }, [routePathname]);

  useEffect(() => {
    setCurrentTheme(initTheme());
    void checkAuthAndLoad();
  }, []);

  const loadAllData = async () => {
    const [overview, eveningList, playerList] = await Promise.all([
      api.getCrmOverview(),
      api.getEvenings(),
      api.getPlayers(),
    ]);
    setCrmOverview(overview);
    setEvenings(eveningList);
    setPlayers(playerList);
  };

  const refreshSnapshotAfterEvening = () => {
    void loadAllData().catch((error: any) => {
      console.error('Failed to refresh organizer snapshot after evening changes:', error);
    });
  };

  useEffect(() => {
    if (!isOrganizer || typeof window === 'undefined' || typeof document === 'undefined') return;

    const scheduleRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (resumeRefreshTimerRef.current !== null) window.clearTimeout(resumeRefreshTimerRef.current);
      resumeRefreshTimerRef.current = window.setTimeout(() => {
        resumeRefreshTimerRef.current = null;
        refreshSnapshotAfterEvening();
      }, 120);
    };

    document.addEventListener('visibilitychange', scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    return () => {
      document.removeEventListener('visibilitychange', scheduleRefresh);
      window.removeEventListener('focus', scheduleRefresh);
      if (resumeRefreshTimerRef.current !== null) {
        window.clearTimeout(resumeRefreshTimerRef.current);
        resumeRefreshTimerRef.current = null;
      }
    };
  }, [isOrganizer]);

  const checkAuthAndLoad = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const me = await api.getMe();
      if (!me.isOrganizer) {
        setIsOrganizer(false);
        setShowLoginModal(true);
        return;
      }
      setIsOrganizer(true);
      setShowLoginModal(false);
      await loadAllData();
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        setIsOrganizer(false);
        setShowLoginModal(true);
      } else {
        setLoadError(error?.message || 'Не удалось загрузить данные CRM');
      }
    } finally {
      setLoading(false);
    }
  };

  const retryLoad = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await loadAllData();
    } catch (error: any) {
      setLoadError(error?.message || 'Не удалось загрузить данные CRM');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    try {
      await api.login(passwordInput);
      setIsOrganizer(true);
      setShowLoginModal(false);
      setLoading(true);
      await loadAllData();
    } catch (error: any) {
      setLoginError(error?.message || 'Неверный пароль организатора');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setIsOrganizer(false);
    setShowLoginModal(true);
    setCrmOverview(null);
    setEvenings([]);
    setPlayers([]);
    setActiveEveningId(null);
    setActiveEveningSection('overview');
    setActivePlayerId(null);
    setActiveTab('overview');
    navigateAdmin('/admin', true);
  };

  const handleOpenEvening = (id: string) => {
    eveningListScrollRef.current = activeTab === 'evenings' && !activeEveningId && typeof window !== 'undefined' ? window.scrollY : 0;
    setActivePlayerId(null);
    setPlayerReturnContext(null);
    setActiveEveningId(id);
    setActiveEveningSection('overview');
    setEveningIntent(null);
    setActiveTab('evenings');
    navigateAdmin(organizerEveningPath(id));
    moveWindowScroll(0);
  };

  const handleOpenEveningAdd = (id: string) => {
    eveningListScrollRef.current = activeTab === 'evenings' && !activeEveningId && typeof window !== 'undefined' ? window.scrollY : 0;
    setActivePlayerId(null);
    setPlayerReturnContext(null);
    setActiveEveningId(id);
    setActiveEveningSection('participants');
    setEveningIntent('add');
    setActiveTab('evenings');
    navigateAdmin(organizerEveningPath(id, 'participants'));
    moveWindowScroll(0);
  };

  const handleOpenPlayer = (id: string) => {
    setPlayerReturnContext({
      tab: activeTab,
      eveningId: activeEveningId,
      eveningSection: activeEveningSection,
      scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
    });
    setActivePlayerId(id);
    setActiveTab('players');
    navigateAdmin(organizerPlayerPath(id));
    moveWindowScroll(0);
  };

  const handleCloseExternalPlayer = () => {
    const returnContext = playerReturnContext;
    setActivePlayerId(null);
    setPlayerReturnContext(null);

    if (returnContext) {
      setActiveTab(returnContext.tab);
      setActiveEveningId(returnContext.eveningId);
      setActiveEveningSection(returnContext.eveningSection);
      navigateAdmin(routePathForReturnContext(returnContext), true);
      moveWindowScroll(returnContext.scrollY);
      return;
    }

    setActiveTab('players');
    setActiveEveningId(null);
    setActiveEveningSection('overview');
    navigateAdmin('/admin/players', true);
    moveWindowScroll(0);
  };

  const handleCreateEvening = async (data: Partial<GameEvening>) => {
    await api.createEvening(data);
    setEveningIntent(null);
    await retryLoad();
  };

  const openCreateEvening = () => {
    setActiveEveningId(null);
    setActiveEveningSection('overview');
    setEveningIntent('create');
    setActiveTab('evenings');
    navigateAdmin('/admin/evenings');
  };

  const switchPrimaryTab = (tab: OrganizerPrimaryTab) => {
    const leavingEvening = activeEveningId !== null;
    const opensNewRoot = activeTab !== tab || leavingEvening || activePlayerId !== null;
    setActivePlayerId(null);
    setPlayerReturnContext(null);
    setActiveEveningId(null);
    setActiveEveningSection('overview');
    if (tab === 'overview' || tab === 'evenings') setEveningIntent(null);
    setActiveTab(tab);
    navigateAdmin(organizerTabPath(tab));
    if (leavingEvening) refreshSnapshotAfterEvening();
    if (opensNewRoot) moveWindowScroll(0);
  };

  const openSecondaryTab = (tab: 'tasks' | 'analytics') => {
    setActivePlayerId(null);
    setPlayerReturnContext(null);
    setActiveEveningId(null);
    setActiveEveningSection('overview');
    setEveningIntent(null);
    setActiveTab(tab);
    navigateAdmin(organizerTabPath(tab));
    moveWindowScroll(0);
  };

  const primaryActive = activeTab === 'tasks' || activeTab === 'analytics' ? 'more' : activeTab;
  const activeEvening = useMemo(() => evenings.find((item) => item.id === activeEveningId) || null, [evenings, activeEveningId]);
  const activePlayer = useMemo(() => players.find((item) => item.id === activePlayerId) || null, [players, activePlayerId]);

  const screenTitle = activePlayerId
    ? activePlayer?.nickname || 'Профиль игрока'
    : activeEveningId && activeTab === 'evenings'
      ? activeEvening?.title || 'Клубный вечер'
      : activeTab === 'overview'
        ? 'Сегодня'
        : activeTab === 'evenings'
          ? 'События'
          : activeTab === 'players'
            ? 'Игроки'
            : activeTab === 'tasks'
              ? 'Все задачи'
              : activeTab === 'analytics'
                ? 'Аналитика'
                : 'Ещё';

  const navMeta = {
    overview: { icon: RefreshCw },
    evenings: { icon: Calendar },
    players: { icon: Users },
    more: { icon: Menu },
  } satisfies Record<OrganizerPrimaryTab, { icon: React.ComponentType<{ className?: string }> }>;

  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col overflow-x-hidden bg-app-bg font-sans text-text-primary transition-colors duration-200">
      <header className="sticky top-0 z-40 hidden min-h-[60px] shrink-0 items-center border-b border-border-soft bg-app-bg/95 px-4 backdrop-blur-xl sm:flex">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-black leading-tight tracking-tight text-text-primary sm:text-[17px]">{screenTitle}</h1>
            <span className="mt-0.5 hidden truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted sm:block">2LA noire · NEWMAFIA</span>
          </div>

          {isOrganizer ? (
            <nav className="hidden items-center gap-1 rounded-[13px] border border-border-soft bg-surface-1 p-1 md:flex">
              {ORGANIZER_PRIMARY_NAV.map((item) => {
                const Icon = navMeta[item.id].icon;
                const active = primaryActive === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => switchPrimaryTab(item.id)}
                    className={`inline-flex min-h-[42px] items-center gap-2 rounded-[10px] px-3 text-[12px] font-bold transition-colors ${active ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                  >
                    <Icon className="h-4 w-4" /> {item.label}
                  </button>
                );
              })}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-2.5 pb-[calc(80px+env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 sm:pb-8">
        {loading ? (
          <div className="flex min-h-[48vh] flex-col items-center justify-center gap-3 text-center">
            <RefreshCw className="h-6 w-6 animate-spin text-accent" />
            <div>
              <p className="text-[14px] font-semibold text-text-primary">Загружаем CRM</p>
              <p className="mt-1 text-[12px] text-text-secondary">Игроки, события и очередь действий появятся одновременно</p>
            </div>
          </div>
        ) : loadError && isOrganizer ? (
          <div className="flex min-h-[48vh] items-center justify-center">
            <div className="w-full max-w-sm rounded-[20px] border border-danger/30 bg-danger-soft p-5 text-center">
              <h2 className="text-[16px] font-bold">Не удалось загрузить CRM</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">{loadError}</p>
              <button type="button" onClick={() => void retryLoad()} className="mt-4 min-h-11 w-full rounded-[12px] bg-accent text-[13px] font-bold text-white">Повторить</button>
            </div>
          </div>
        ) : !isOrganizer ? (
          <div className="mx-auto max-w-md space-y-4 py-16 text-center">
            <Lock className="mx-auto h-12 w-12 text-accent" />
            <h2 className="text-xl font-bold">Доступ ограничен</h2>
            <p className="text-[13px] text-text-secondary">Панель управления доступна организатору клуба.</p>
            <button type="button" onClick={() => setShowLoginModal(true)} className="min-h-11 rounded-[12px] bg-accent px-6 text-[13px] font-semibold text-white">Войти</button>
          </div>
        ) : (
          <div className="min-w-0 w-full">
            {activeTab === 'overview' ? (
              <CRMOverview
                overview={crmOverview}
                onOpenEvening={handleOpenEvening}
                onOpenEveningAdd={handleOpenEveningAdd}
                onOpenPlayer={handleOpenPlayer}
                onNavigateTab={(tab) => openSecondaryTab(tab as 'tasks' | 'analytics')}
                onCreateEvening={openCreateEvening}
                onRefresh={retryLoad}
                onCompleteTask={async (taskId) => {
                  await api.completeTask(taskId);
                  await retryLoad();
                }}
              />
            ) : null}

            {activeTab === 'evenings' ? (
              activeEveningId ? (
                <EveningWorkspace
                  eveningId={activeEveningId}
                  initialSection={activeEveningSection}
                  onSectionChange={(section) => {
                    setActiveEveningSection(section);
                    navigateAdmin(organizerEveningPath(activeEveningId, section));
                  }}
                  onBack={() => {
                    setActiveEveningId(null);
                    setActiveEveningSection('overview');
                    setEveningIntent(null);
                    navigateAdmin('/admin/evenings', true);
                    refreshSnapshotAfterEvening();
                    moveWindowScroll(eveningListScrollRef.current);
                  }}
                  onOpenPlayerCard={handleOpenPlayer}
                  initialAddOpen={eveningIntent === 'add'}
                  onInitialAddHandled={() => setEveningIntent(null)}
                />
              ) : (
                <EveningsList
                  evenings={evenings}
                  onOpenEvening={handleOpenEvening}
                  onCreateEvening={handleCreateEvening}
                  initialCreateOpen={eveningIntent === 'create'}
                  onInitialCreateHandled={() => setEveningIntent(null)}
                />
              )
            ) : null}

            {activeTab === 'players' ? (
              <PlayersCRM
                evenings={evenings}
                onOpenEvening={handleOpenEvening}
                selectedPlayerId={activePlayerId}
                onClosePlayerCard={handleCloseExternalPlayer}
                onCrmChanged={retryLoad}
              />
            ) : null}

            {activeTab === 'tasks' ? <TasksCRM players={players} evenings={evenings} onOpenPlayer={handleOpenPlayer} /> : null}
            {activeTab === 'analytics' ? <AnalyticsCRM onOpenThemeModal={() => setShowThemeModal(true)} /> : null}
            {activeTab === 'more' ? (
              <MoreCRM
                onOpenTasks={() => openSecondaryTab('tasks')}
                onOpenAnalytics={() => openSecondaryTab('analytics')}
                onOpenTheme={() => setShowThemeModal(true)}
                onOpenGameEngine={onReturnToGameEngine}
                onLogout={handleLogout}
              />
            ) : null}
          </div>
        )}
      </main>

      {isOrganizer ? (
        <nav className="organizer-bottom-nav glass-nav fixed bottom-0 left-0 right-0 z-40 grid min-h-[64px] h-[calc(64px+env(safe-area-inset-bottom))] grid-cols-4 border-t border-border-soft pb-safe sm:hidden">
          {ORGANIZER_PRIMARY_NAV.map((item) => {
            const Icon = navMeta[item.id].icon;
            const active = primaryActive === item.id;
            return (
              <button key={item.id} type="button" onClick={() => switchPrimaryTab(item.id)} className="relative flex min-h-[48px] min-w-0 flex-col items-center justify-center px-1">
                <Icon className={`h-[21px] w-[21px] ${active ? 'text-accent' : 'text-text-muted'}`} />
                <span className={`mt-1 max-w-full truncate text-[11px] leading-none ${active ? 'font-bold text-text-primary' : 'font-medium text-text-muted'}`}>{item.label}</span>
                {active ? <span className="absolute top-1 h-0.5 w-5 rounded-full bg-accent" /> : null}
              </button>
            );
          })}
        </nav>
      ) : null}

      {showLoginModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-4">
          <div className="w-full max-w-sm space-y-5 rounded-t-[24px] border border-border-soft bg-surface-1 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-text-primary sm:rounded-[24px]">
            <div className="text-center">
              <h3 className="text-[17px] font-bold">Вход для организатора</h3>
              <p className="mt-1 text-[12px] text-text-secondary">Введите пароль для доступа к CRM</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                placeholder="Пароль организатора"
                className="mobile-field text-center"
              />
              {loginError ? <p className="text-center text-[12px] font-semibold text-danger">{loginError}</p> : null}
              <button type="submit" className="min-h-[48px] w-full rounded-[13px] bg-accent text-[13px] font-bold text-white">Войти</button>
            </form>
          </div>
        </div>
      ) : null}

      <ThemeSelectorModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        currentTheme={currentTheme}
        onSelectTheme={setCurrentTheme}
      />
    </div>
  );
};

export default OrganizerCRM;