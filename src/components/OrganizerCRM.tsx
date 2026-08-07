import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  Calendar,
  Users,
  Clock,
  BarChart3,
  Lock,
  LogOut,
  Palette,
} from 'lucide-react';
import { api, GameEvening, Player, CrmOverview } from '../lib/api.ts';
import { CRMOverview } from './crm/CRMOverview.tsx';
import { EveningsList } from './crm/EveningsList.tsx';
import { EveningWorkspace } from './crm/EveningWorkspace.tsx';
import { PlayersCRM } from './crm/PlayersCRM.tsx';
import { TasksCRM } from './crm/TasksCRM.tsx';
import { AnalyticsCRM } from './crm/AnalyticsCRM.tsx';
import { ThemeSelectorModal } from './crm/ThemeSelectorModal.tsx';
import { initTheme, ThemeId } from '../lib/theme.ts';
import { useMobileKeyboardViewport } from '../hooks/useMobileKeyboardViewport.ts';

interface OrganizerCRMProps {
  onReturnToGameEngine?: () => void;
}

export const OrganizerCRM: React.FC<OrganizerCRMProps> = ({ onReturnToGameEngine }) => {
  useMobileKeyboardViewport();
  const [activeTab, setActiveTab] = useState<'overview' | 'evenings' | 'players' | 'tasks' | 'analytics'>('overview');
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

  useEffect(() => {
    const loaded = initTheme();
    setCurrentTheme(loaded);
    checkAuthAndLoad();
  }, []);

  const checkAuthAndLoad = async () => {
    setLoading(true);
    try {
      const me = await api.getMe();
      if (me.isOrganizer) {
        setIsOrganizer(true);
        loadAllData();
      } else {
        setShowLoginModal(true);
      }
    } catch (e) {
      setShowLoginModal(true);
    } finally {
      setLoading(false);
    }
  };

  const loadAllData = async () => {
    try {
      const [ov, evList, pList] = await Promise.all([
        api.getCrmOverview(),
        api.getEvenings(),
        api.getPlayers(),
      ]);
      setCrmOverview(ov);
      setEvenings(evList);
      setPlayers(pList);
    } catch (err: any) {
      console.error('Error loading CRM data:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await api.login(passwordInput);
      setIsOrganizer(true);
      setShowLoginModal(false);
      loadAllData();
    } catch (err: any) {
      setLoginError(err.message || 'Неверный пароль организатора');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setIsOrganizer(false);
    setShowLoginModal(true);
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
    loadAllData();
  };

  return (
    <div className="min-h-[100dvh] w-full max-w-7xl mx-auto flex flex-col bg-app-bg text-text-primary font-sans transition-colors duration-200 relative">
      <header className="sticky top-0 z-40 bg-app-bg/95 backdrop-blur-xl border-b border-border-soft h-[56px] sm:h-[60px] flex items-center shrink-0 px-3.5 sm:px-4">
        <div className="w-full flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 bg-accent rounded-[10px] flex items-center justify-center font-black text-white text-base shrink-0 shadow-sm">M</div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-text-primary tracking-wide leading-tight truncate">NEWMAFIA</h1>
              <span className="text-[11px] text-text-secondary font-medium block truncate">CRM организатора</span>
            </div>
          </div>

          {isOrganizer && (
            <nav className="hidden md:flex items-center gap-1 bg-surface-1 p-1 rounded-[12px] border border-border-soft text-xs font-semibold">
              <button onClick={() => { setActiveEveningId(null); setActiveTab('overview'); }} className={`px-3 py-1.5 rounded-[10px] flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${activeTab === 'overview' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}><LayoutGrid className="w-3.5 h-3.5 stroke-[2]" /><span>Пульс</span></button>
              <button onClick={() => { setActiveEveningId(null); setActiveTab('evenings'); }} className={`px-3 py-1.5 rounded-[10px] flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${activeTab === 'evenings' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}><Calendar className="w-3.5 h-3.5 stroke-[1.8]" /><span>Вечера</span></button>
              <button onClick={() => setActiveTab('players')} className={`px-3 py-1.5 rounded-[10px] flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${activeTab === 'players' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}><Users className="w-3.5 h-3.5 stroke-[1.8]" /><span>Игроки</span></button>
              <button onClick={() => setActiveTab('tasks')} className={`px-3 py-1.5 rounded-[10px] flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${activeTab === 'tasks' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}><Clock className="w-3.5 h-3.5 stroke-[1.8]" /><span>Задачи</span></button>
              <button onClick={() => setActiveTab('analytics')} className={`px-3 py-1.5 rounded-[10px] flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${activeTab === 'analytics' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}><BarChart3 className="w-3.5 h-3.5 stroke-[1.8]" /><span>Анализ</span></button>
            </nav>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowThemeModal(true)} className="w-9 h-9 bg-surface-1 border border-border-soft hover:border-accent/50 rounded-[10px] text-text-secondary hover:text-accent flex items-center justify-center cursor-pointer transition-all shrink-0" title="Тема интерфейса"><Palette className="w-4 h-4 stroke-[1.8]" /></button>
            {onReturnToGameEngine && <button onClick={onReturnToGameEngine} className="hidden sm:inline-flex bg-surface-1 hover:bg-surface-hover text-text-primary border border-border-soft font-semibold px-3 py-1.5 rounded-[10px] text-xs transition-all cursor-pointer">Игровой движок</button>}
            {isOrganizer && <button onClick={handleLogout} className="w-9 h-9 bg-surface-1 border border-border-soft hover:border-border-strong rounded-[10px] text-text-secondary hover:text-danger flex items-center justify-center cursor-pointer transition-all shrink-0" title="Выйти из режима организатора"><LogOut className="w-4 h-4 stroke-[1.8]" /></button>}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-3.5 sm:px-4 py-3 sm:py-4 pb-[calc(76px+env(safe-area-inset-bottom))] sm:pb-8">
        {loading ? (
          <div className="py-20 text-center text-text-secondary text-xs">Загрузка данных системы...</div>
        ) : !isOrganizer ? (
          <div className="max-w-md mx-auto py-20 text-center space-y-4">
            <Lock className="w-12 h-12 text-accent mx-auto" />
            <h2 className="text-xl font-bold text-text-primary">Доступ ограничен</h2>
            <p className="text-xs text-text-secondary">Панель управления CRM доступна только авторизованному организатору клуба.</p>
            <button onClick={() => setShowLoginModal(true)} className="bg-accent hover:bg-accent-hover text-white font-semibold px-6 py-3 rounded-[12px] text-xs transition-all cursor-pointer min-h-[44px]">Войти как организатор</button>
          </div>
        ) : (
          <div className="w-full">
            {activeTab === 'overview' && (
              <CRMOverview
                overview={crmOverview}
                onOpenEvening={handleOpenEvening}
                onOpenPlayer={handleOpenPlayer}
                onNavigateTab={(tab) => setActiveTab(tab as any)}
                onRefresh={loadAllData}
                onCompleteTask={async (taskId) => { await api.completeTask(taskId); loadAllData(); }}
              />
            )}

            {activeTab === 'evenings' && (
              <div className="w-full">
                {activeEveningId ? (
                  <EveningWorkspace
                    eveningId={activeEveningId}
                    onBack={() => setActiveEveningId(null)}
                    onOpenPlayerCard={handleOpenPlayer}
                  />
                ) : (
                  <EveningsList evenings={evenings} onOpenEvening={handleOpenEvening} onCreateEvening={handleCreateEvening} />
                )}
              </div>
            )}

            {activeTab === 'players' && (
              <div className="w-full"><PlayersCRM evenings={evenings} onOpenEvening={handleOpenEvening} selectedPlayerId={activePlayerId} onClosePlayerCard={() => setActivePlayerId(null)} onCrmChanged={loadAllData} /></div>
            )}

            {activeTab === 'tasks' && (
              <div className="w-full"><TasksCRM players={players} evenings={evenings} onOpenPlayer={handleOpenPlayer} /></div>
            )}

            {activeTab === 'analytics' && (
              <div className="w-full"><AnalyticsCRM onOpenThemeModal={() => setShowThemeModal(true)} /></div>
            )}
          </div>
        )}
      </main>

      {isOrganizer && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 glass-nav organizer-bottom-nav flex items-center justify-around px-1 z-40 pb-safe min-h-[60px] h-[calc(60px+env(safe-area-inset-bottom))] border-t border-border-soft shrink-0">
          {[
            { id: 'overview', label: 'Пульс', icon: LayoutGrid },
            { id: 'evenings', label: 'Вечера', icon: Calendar },
            { id: 'players', label: 'Игроки', icon: Users },
            { id: 'tasks', label: 'Задачи', icon: Clock },
            { id: 'analytics', label: 'Анализ', icon: BarChart3 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { if (tab.id === 'overview' || tab.id === 'evenings') setActiveEveningId(null); setActiveTab(tab.id as any); }} className="flex flex-col items-center justify-center flex-1 min-h-[44px] min-w-[44px] h-full cursor-pointer transition-all relative group py-1">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isActive ? 'text-accent' : 'text-text-muted group-hover:text-text-secondary'}`}><Icon className="w-[22px] h-[22px] stroke-[2]" /></div>
                <span className={`text-[10px] mt-0.5 transition-colors ${isActive ? 'text-text-primary font-bold' : 'text-text-muted font-medium'}`}>{tab.label}</span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent absolute bottom-1 shadow-[0_0_8px_var(--accent)]" />}
              </button>
            );
          })}
        </nav>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-surface-1 border border-border-soft rounded-[20px] max-w-sm w-full p-6 space-y-5 text-text-primary">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-accent-soft border border-accent/30 rounded-[12px] flex items-center justify-center mx-auto text-accent"><Lock className="w-6 h-6 stroke-[1.8]" /></div>
              <h3 className="text-lg font-bold">Вход для организатора</h3>
              <p className="text-xs text-text-secondary">Введите пароль для доступа к управлению клубом</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="Пароль организатора" className="w-full bg-surface-2 border border-border-soft rounded-[12px] px-4 py-3 text-xs text-text-primary focus:outline-none focus:border-accent text-center" />
                {loginError && <p className="text-[11px] text-danger font-semibold mt-1 text-center">{loginError}</p>}
              </div>
              <button type="submit" className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-[12px] text-xs transition-all cursor-pointer">Войти как организатор</button>
            </form>
          </div>
        </div>
      )}

      <ThemeSelectorModal isOpen={showThemeModal} onClose={() => setShowThemeModal(false)} currentTheme={currentTheme} onSelectTheme={(themeId) => setCurrentTheme(themeId)} />
    </div>
  );
};

export default OrganizerCRM;
