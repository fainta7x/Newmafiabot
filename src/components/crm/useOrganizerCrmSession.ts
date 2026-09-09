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

const fetchCrmOverview = async (signal: AbortSignal): Promise<CrmOverview> => {
  const response = await fetch('/api/crm/overview', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error: any = new Error(body?.error || body?.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body as CrmOverview;
};

export const useOrganizerCrmSession = () => {
  const resumeRefreshTimerRef = useRef<number | null>(null);
  const refreshGenerationRef = useRef(0);
  const overviewAbortRef = useRef<AbortController | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [crmOverview, setCrmOverview] = useState<CrmOverview | null>(null);
  const [evenings, setEvenings] = useState<GameEvening[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const measureRequest = async <T,>(label: string, request: () => Promise<T>): Promise<T> => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      return await request();
    } finally {
      const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const durationMs = Math.round(finishedAt - startedAt);
      if (durationMs >= 500) console.info(`[CRM performance] ${label}: ${durationMs} ms`);
    }
  };

  const loadAllData = async (): Promise<boolean> => {
    const generation = ++refreshGenerationRef.current;
    overviewAbortRef.current?.abort();
    const controller = new AbortController();
    overviewAbortRef.current = controller;

    // Start every request together, but only the newest generation may publish
    // any result. This prevents a slow interval/resume request from overwriting a
    // newer manual refresh or foreground refresh.
    const playersPromise = measureRequest('players', () => api.getPlayers())
      .then((value) => {
        if (generation === refreshGenerationRef.current) setPlayers(value);
      })
      .catch((error) => {
        if (generation === refreshGenerationRef.current) console.error('Failed to load organizer player directory:', error);
      });

    try {
      const [overview, eveningList] = await Promise.all([
        measureRequest('overview', () => fetchCrmOverview(controller.signal)),
        measureRequest('evenings', () => api.getEvenings()),
      ]);
      if (generation !== refreshGenerationRef.current) return false;
      setCrmOverview(overview);
      setEvenings(eveningList);
      void playersPromise;
      return true;
    } catch (error: any) {
      if (generation !== refreshGenerationRef.current || error?.name === 'AbortError') return false;
      throw error;
    } finally {
      if (overviewAbortRef.current === controller) overviewAbortRef.current = null;
    }
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
    const needsBlockingLoader = crmOverview === null;
    if (needsBlockingLoader) setLoading(true);
    setLoadError(null);
    try {
      await loadAllData();
    } catch (error: any) {
      setLoadError(error?.message || 'Не удалось загрузить данные CRM');
    } finally {
      if (needsBlockingLoader) setLoading(false);
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
    refreshGenerationRef.current += 1;
    overviewAbortRef.current?.abort();
    overviewAbortRef.current = null;
    await api.logout();
    setIsOrganizer(false);
    setShowLoginModal(true);
    setCrmOverview(null);
    setEvenings([]);
    setPlayers([]);
  };

  useEffect(() => {
    void checkAuthAndLoad();
    return () => {
      refreshGenerationRef.current += 1;
      overviewAbortRef.current?.abort();
      overviewAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isOrganizer || typeof window === 'undefined' || typeof document === 'undefined') return;

    const refreshVisibleSnapshot = () => {
      if (document.visibilityState === 'hidden') return;
      void loadAllData().catch((error: any) => {
        console.error('Failed to refresh visible organizer snapshot:', error);
      });
    };

    const scheduleRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (resumeRefreshTimerRef.current !== null) window.clearTimeout(resumeRefreshTimerRef.current);
      resumeRefreshTimerRef.current = window.setTimeout(() => {
        resumeRefreshTimerRef.current = null;
        refreshVisibleSnapshot();
      }, 120);
    };

    const interval = window.setInterval(refreshVisibleSnapshot, 15_000);
    document.addEventListener('visibilitychange', scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    return () => {
      window.clearInterval(interval);
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
