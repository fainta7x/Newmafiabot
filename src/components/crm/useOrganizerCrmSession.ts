import { useEffect, useRef, useState } from 'react';
import { api, type CrmOverview, type GameEvening, type Player } from '../../lib/api.ts';

const refreshTelegramPlayerSession = async () => {
  if (typeof window === 'undefined') return;
  const initData = (window as any).Telegram?.WebApp?.initData;
  if (typeof initData !== 'string' || !initData) return;

  try {
    // /admin is rendered outside the normal player bootstrap, so explicitly
    // refresh the server-verified Telegram player session before /auth/me.
    // Failure is non-fatal: password login remains the recovery path.
    await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ initData }),
    });
  } catch {
    // Keep the existing password fallback if Telegram is unavailable.
  }
};

export const useOrganizerCrmSession = () => {
  const resumeRefreshTimerRef = useRef<number | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [crmOverview, setCrmOverview] = useState<CrmOverview | null>(null);
  const [evenings, setEvenings] = useState<GameEvening[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const checkAuthAndLoad = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await refreshTelegramPlayerSession();
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

  const login = async (password: string) => {
    setLoginError('');
    try {
      await api.login(password);
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

  const logout = async () => {
    await api.logout();
    setIsOrganizer(false);
    setShowLoginModal(true);
    setCrmOverview(null);
    setEvenings([]);
    setPlayers([]);
  };

  useEffect(() => {
    void checkAuthAndLoad();
  }, []);

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

  return {
    isOrganizer,
    showLoginModal,
    setShowLoginModal,
    loginError,
    crmOverview,
    evenings,
    players,
    loading,
    loadError,
    retryLoad,
    refreshSnapshotAfterEvening,
    login,
    logout,
  };
};
