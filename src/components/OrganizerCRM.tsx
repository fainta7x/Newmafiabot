import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  Clock,
  LayoutGrid,
  Lock,
  LogOut,
  Palette,
  RefreshCw,
  Users,
} from 'lucide-react';
import { api, type CrmOverview, type GameEvening, type Player } from '../lib/api.ts';
import { CRMOverview } from './crm/CRMOverview.tsx';
import { EveningsList } from './crm/EveningsList.tsx';
import { EveningWorkspace } from './crm/EveningWorkspace.tsx';
import { PlayersCRM } from './crm/PlayersCRM.tsx';
import { TasksCRM } from './crm/TasksCRM.tsx';
import { AnalyticsCRM } from './crm/AnalyticsCRM.tsx';
import { ThemeSelectorModal } from './crm/ThemeSelectorModal.tsx';
import { initTheme, type ThemeId } from '../lib/theme.ts';
import { useMobileKeyboardViewport } from '../hooks/useMobileKeyboardViewport.ts';

interface OrganizerCRMProps {
  onReturnToGameEngine?: () => void;
}

type MainTab = 'overview' | 'evenings' | 'players' | 'tasks' | 'analytics';

export const OrganizerCRM: React.FC<OrganizerCRMProps> = ({ onReturnToGameEngine }) => {
  useMobileKeyboardViewport();

  const [activeTab, setActiveTab] = useState<MainTab>('overview');
  const [activeEveningId, setActiveEveningId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

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
      try {
        await loadAllData();
      } catch (error: any) {
        setLoadError(error?.message || 'Не удалось загрузить данные CRM');
      }
    } catch {
      setIsOrganizer(false);
      setShowLoginModal(true);
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
      try {
        await loadAllData();
      } catch (error: any) {
        setLoadError(error?.message || 'Вход выполнен, но данные CRM не загрузились');
      } finally {
        setLoading(false);
      }
    } catch (error: any) {
      setLoginError(error?.message || 'Неверный пароль организатора');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setIsOrganizer(false);
    setShowLoginModal(true);
    setCrmOverview(null);
    setEvenings([]);
    setPlayers([]);
  };

  const handleOpenEvening = (id: string) => {
    setActiveEveningId(id);
    setActiveTab('evenings');
  };

  const handleOpenPlayer = (id: string) => {
    setActivePlayerId(id);
    setActiveTab('players');
  };

  const handleCreateEvening = async (data: Partial<GameEvening>) => {
    await api.createEvening(data);
    await retryLoad();
  };

  const switchTab = (tab: MainTab) => {
    if (tab === 'overview' || tab === 'evenings') setActiveEveningId(null);
    setActiveTab(tab);
  };

  const tabs = [
    { id: 'overview' as const, label: 'Пульс', icon: LayoutGrid },
    { id: 'evenings' as const, label: 'События', icon: Calendar },
    { id: 'players' as const, label: 'Игроки', icon: Users },
    { id: 'tasks' as const, label: 'Задачи', icon: Clock },
    { id: 'analytics' as const, label: 'Анализ', icon: BarChart3 },
  ];

  return (
    <div className="min-h-[100dvh] w-full max-w-7xl mx-auto flex flex-col bg-app-bg text-text-primary font-sans transition-colors duration-200 relative overflow-x-hidden">
      <header className="sticky top-0 z-40 bg-app-bg/95 backdrop-blur-xl border-b border-border-soft min-h-[60px] flex items-center shrink-0 px-3 sm:px-4">
        <div className="w-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 bg-accent rounded-[11px] flex items-center justify-center font-black text-white text-base shrink-0 shadow-sm">M</div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold text-text-primary tracking-wide leading-tight truncate">NEWMAFIA</h1>
              <span className="text-[11px] text-text-secondary font-medium block truncate">CRM организатора</span>
            </div>
          </div>

          {isOrganizer ? (
            <nav className="hidden md:flex items-center gap-1 bg-surface-1 p-1 rounded-[12px] border border-border-soft text-[12px] font-semibold">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => switchTab(tab.id)} className={`min-h-10 px-3 rounded-[10px] flex items-center gap-1.5 whitespace-nowrap transition-colors ${active ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}>
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          ) : null}

          <div className="flex items-center gap-1.5 shrink-0">
            <button aria-label="Выбрать тему" onClick={() => setShowThemeModal(true)} className="w-11 h-11 bg-surface-1 border border-border-soft hover:border-accent/50 rounded-[12px] text-text-secondary hover:text-accent flex items-center justify-center transition-colors">
              <Palette className="w-5 h-5" />
            </button>
            {onReturnToGameEngine ? (
              <button onClick={onReturnToGameEngine} className="hidden sm:inline-flex min-h-11 bg-surface-1 hover:bg-surface-hover text-text-primary border border-border-soft font-semibold px-3 rounded-[12px] text-[12px] items-center">
                Игровой движок
              </button>
            ) : null}
            {isOrganizer ? (
              <button aria-label="Выйти" onClick={() => void handleLogout()} className="w-11 h-11 bg-surface-1 border border-border-soft hover:border-border-strong rounded-[12px] text-text-secondary hover:text-danger flex items-center justify-center transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4 pb-[calc(76px+env(safe-area-inset-bottom))] sm:pb-8">
        {loading ? (
          <div className="min-h-[48vh] flex flex-col items-center justify-center gap-3 text-center">
            <RefreshCw className="w-6 h-6 text-accent animate-spin" />
            <div>
              <p className="text-[14px] font-semibold text-text-primary">Загружаем CRM</p>
              <p className="mt-1 text-[12px] text-text-secondary">Игроки, события и сводка появятся одновременно</p>
            </div>
          </div>
        ) : loadError && isOrganizer ? (
          <div className="min-h-[48vh] flex items-center justify-center">
            <div className="w-full max-w-sm rounded-[20px] border border-danger/30 bg-danger-soft p-5 text-center">
              <AlertCircle className="w-8 h-8 text-danger mx-auto" />
              <h2 className="mt-3 text-[16px] font-bold">Не удалось загрузить CRM</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">{loadError}</p>
              <button onClick={() => void retryLoad()} className="mt-4 min-h-11 w-full rounded-[12px] bg-accent text-white text-[13px] font-bold flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Повторить
              </button>
            </div>
          </div>
        ) : !isOrganizer ? (
          <div className="max-w-md mx-auto py-16 text-center space-y-4">
            <Lock className="w-12 h-12 text-accent mx-auto" />
            <h2 className="text-xl font-bold text-text-primary">Доступ ограничен</h2>
            <p className="text-[13px] text-text-secondary">Панель управления CRM доступна только авторизованному организатору клуба.</p>
            <button onClick={() => setShowLoginModal(true)} className="bg-accent hover:bg-accent-hover text-white font-semibold px-6 min-h-11 rounded-[12px] text-[13px]">Войти как организатор</button>
          </div>
        ) : (
          <div className="w-full min-w-0">
            {activeTab === 'overview' ? (
              <CRMOverview
                overview={crmOverview}
                onOpenEvening={handleOpenEvening}
                onOpenPlayer={handleOpenPlayer}
                onNavigateTab={(tab) => setActiveTab(tab as MainTab)}
                onRefresh={retryLoad}
                onCompleteTask={async (taskId) => { await api.completeTask(taskId); await retryLoad(); }}
              />
            ) : null}

            {activeTab === 'evenings' ? (
              activeEveningId ? (
                <EveningWorkspace eveningId={activeEveningId} onBack={() => setActiveEveningId(null)} onOpenPlayerCard={handleOpenPlayer} />
              ) : (
                <EveningsList evenings={evenings} onOpenEvening={handleOpenEvening} onCreateEvening={handleCreateEvening} />
              )
            ) : null}

            {activeTab === 'players' ? (
              <PlayersCRM evenings={evenings} onOpenEvening={handleOpenEvening} selectedPlayerId={activePlayerId} onClosePlayerCard={() => setActivePlayerId(null)} onCrmChanged={retryLoad} />
            ) : null}

            {activeTab === 'tasks' ? (
              <TasksCRM players={players} evenings={evenings} onOpenPlayer={handleOpenPlayer} />
            ) : null}

            {activeTab === 'analytics' ? <AnalyticsCRM onOpenThemeModal={() => setShowThemeModal(true)} /> : null}
          </div>
        )}
      </main>

      {isOrganizer ? (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 glass-nav organizer-bottom-nav grid grid-cols-5 z-40 pb-safe min-h-[64px] h-[calc(64px+env(safe-area-inset-bottom))] border-t border-border-soft">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => switchTab(tab.id)} className="min-w-0 min-h-[48px] px-0.5 flex flex-col items-center justify-center relative">
                <Icon className={`w-[21px] h-[21px] ${active ? 'text-accent' : 'text-text-muted'}`} />
                <span className={`mt-1 text-[10px] leading-none truncate max-w-full ${active ? 'text-text-primary font-bold' : 'text-text-muted font-medium'}`}>{tab.label}</span>
                {active ? <span className="absolute top-1 w-5 h-0.5 rounded-full bg-accent" /> : null}
              </button>
            );
          })}
        </nav>
      ) : null}

      {showLoginModal ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md sm:p-4">
          <div className="bg-surface-1 border border-border-soft rounded-t-[24px] sm:rounded-[24px] max-w-sm w-full p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-5 text-text-primary">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-accent-soft border border-accent/30 rounded-[12px] flex items-center justify-center mx-auto text-accent"><Lock className="w-6 h-6" /></div>
              <h3 className="text-[17px] font-bold">Вход для организатора</h3>
              <p className="text-[12px] text-text-secondary">Введите пароль для доступа к управлению клубом</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input type="password" value={passwordInput} onChange={(event) => setPasswordInput(event.target.value)} placeholder="Пароль организатора" className="w-full min-h-11 bg-surface-2 border border-border-soft rounded-[12px] px-4 text-[14px] text-text-primary focus:outline-none focus:border-accent text-center" />
                {loginError ? <p className="text-[12px] text-danger font-semibold mt-2 text-center">{loginError}</p> : null}
              </div>
              <button type="submit" className="w-full min-h-11 bg-accent hover:bg-accent-hover text-white font-semibold rounded-[12px] text-[13px]">Войти как организатор</button>
            </form>
          </div>
        </div>
      ) : null}

      <ThemeSelectorModal isOpen={showThemeModal} onClose={() => setShowThemeModal(false)} currentTheme={currentTheme} onSelectTheme={setCurrentTheme} />
    </div>
  );
};

export default OrganizerCRM;
