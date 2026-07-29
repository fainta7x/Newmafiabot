import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Clock,
  BarChart3,
  Lock,
  LogOut,
} from 'lucide-react';
import { api, GameEvening, Player, CrmOverview } from '../lib/api.ts';
import { CRMOverview } from './crm/CRMOverview.tsx';
import { EveningsList } from './crm/EveningsList.tsx';
import { EveningDetailView } from './crm/EveningDetailView.tsx';
import { PlayersCRM } from './crm/PlayersCRM.tsx';
import { TasksCRM } from './crm/TasksCRM.tsx';
import { AnalyticsCRM } from './crm/AnalyticsCRM.tsx';

interface OrganizerCRMProps {
  onReturnToGameEngine?: () => void;
}

export const OrganizerCRM: React.FC<OrganizerCRMProps> = ({ onReturnToGameEngine }) => {

  const [activeTab, setActiveTab] = useState<'overview' | 'evenings' | 'players' | 'tasks' | 'analytics'>('overview');
  const [activeEveningId, setActiveEveningId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  const [isOrganizer, setIsOrganizer] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Global State for CRM
  const [crmOverview, setCrmOverview] = useState<CrmOverview | null>(null);
  const [evenings, setEvenings] = useState<GameEvening[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12">
      {/* Top Header Nav */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-rose-600 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-lg shadow-rose-600/30">
              M
            </div>
            <div>
              <h1 className="text-base font-black text-white uppercase tracking-wider leading-none">
                Newmafia CRM
              </h1>
              <span className="text-[10px] text-rose-400 font-mono font-bold">Организатор Клуба Мафии</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          {isOrganizer && (
            <nav className="hidden sm:flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold overflow-x-auto max-w-full">
              <button
                onClick={() => {
                  setActiveEveningId(null);
                  setActiveTab('overview');
                }}
                className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'overview' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Пульс</span>
              </button>

              <button
                onClick={() => {
                  setActiveEveningId(null);
                  setActiveTab('evenings');
                }}
                className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'evenings' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Вечера</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('players');
                }}
                className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'players' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Игроки</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('tasks');
                }}
                className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'tasks' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Задачи</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('analytics');
                }}
                className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'analytics' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Аналитика</span>
              </button>
            </nav>
          )}

          {/* Quick Actions & Logout */}
          <div className="flex items-center gap-2">
            {onReturnToGameEngine && (
              <button
                onClick={onReturnToGameEngine}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-3 py-1.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Игровой Движок
              </button>
            )}

            {isOrganizer && (
              <button
                onClick={handleLogout}
                className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-400 hover:text-rose-400 cursor-pointer"
                title="Выйти из режима организатора"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="max-w-7xl mx-auto px-4 pt-6">
        {loading ? (
          <div className="py-20 text-center text-slate-500 text-xs font-mono">Загрузка данных системы...</div>
        ) : !isOrganizer ? (
          <div className="max-w-md mx-auto py-20 text-center space-y-4">
            <Lock className="w-12 h-12 text-rose-500 mx-auto animate-pulse" />
            <h2 className="text-xl font-black text-white uppercase">Доступ ограничен</h2>
            <p className="text-xs text-slate-400">Панель управления CRM доступна только авторизованному организатору клуба.</p>
            <button
              onClick={() => setShowLoginModal(true)}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-6 py-3 rounded-2xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-rose-600/20"
            >
              Войти как Организатор
            </button>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <CRMOverview
                overview={crmOverview}
                onOpenEvening={handleOpenEvening}
                onOpenPlayer={handleOpenPlayer}
                onNavigateTab={(tab) => setActiveTab(tab as any)}
                onRefresh={loadAllData}
                onCompleteTask={async (taskId) => {
                  await api.completeTask(taskId);
                  loadAllData();
                }}
              />
            )}

            {/* Evenings Tab */}
            {activeTab === 'evenings' && (
              activeEveningId ? (
                <EveningDetailView
                  eveningId={activeEveningId}
                  onBack={() => setActiveEveningId(null)}
                  onOpenPlayerCard={handleOpenPlayer}
                />
              ) : (
                <EveningsList
                  evenings={evenings}
                  onOpenEvening={handleOpenEvening}
                  onCreateEvening={handleCreateEvening}
                />
              )
            )}

            {/* Players Tab */}
            {activeTab === 'players' && (
              <PlayersCRM
                evenings={evenings}
                onOpenEvening={handleOpenEvening}
                selectedPlayerId={activePlayerId}
                onClosePlayerCard={() => setActivePlayerId(null)}
              />
            )}

            {/* Tasks Tab */}
            {activeTab === 'tasks' && (
              <TasksCRM
                players={players}
                evenings={evenings}
                onOpenPlayer={handleOpenPlayer}
              />
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && <AnalyticsCRM />}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      {isOrganizer && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-800 flex justify-around p-2 z-40 pb-safe backdrop-blur-md shadow-2xl">
          <button
            onClick={() => {
              setActiveEveningId(null);
              setActiveTab('overview');
            }}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              activeTab === 'overview' ? 'text-rose-400 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-[9px] uppercase tracking-tight mt-0.5 font-mono">Пульс</span>
          </button>

          <button
            onClick={() => {
              setActiveEveningId(null);
              setActiveTab('evenings');
            }}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              activeTab === 'evenings' ? 'text-rose-400 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span className="text-[9px] uppercase tracking-tight mt-0.5 font-mono">Вечера</span>
          </button>

          <button
            onClick={() => setActiveTab('players')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              activeTab === 'players' ? 'text-rose-400 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="text-[9px] uppercase tracking-tight mt-0.5 font-mono">Игроки</span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              activeTab === 'tasks' ? 'text-rose-400 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="text-[9px] uppercase tracking-tight mt-0.5 font-mono">Задачи</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              activeTab === 'analytics' ? 'text-rose-400 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span className="text-[9px] uppercase tracking-tight mt-0.5 font-mono">Анализ</span>
          </button>
        </nav>
      )}

      {/* LOGIN MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-5 text-white">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-rose-600/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight">Вход для Организатора</h3>
              <p className="text-xs text-slate-400">Введите пароль для доступа к управлению клубом</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Пароль организатора"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-rose-500 font-mono text-center"
                />
                {loginError && <p className="text-[11px] text-rose-400 font-bold mt-1 text-center">{loginError}</p>}
              </div>

              <button
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-rose-600/20"
              >
                Авторизоваться
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizerCRM;

