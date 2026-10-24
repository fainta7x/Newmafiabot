import { useEffect, useRef, useState } from 'react';
import { api, type Tournament } from '../../../lib/api.ts';

/**
 * Loads one tournament for its card: the first load shows the loading screen, later silent refreshes keep the card on
 * screen and only report a failure, and the card opens on the game that is being played (or the next one to play).
 */
export const useTournamentDetail = ({ tournamentId, onSilentError }: { tournamentId: string; onSilentError: (message: string) => void }) => {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ status: number | null; message: string } | null>(null);
  const [selectedGameIdx, setSelectedGameIdx] = useState(0);
  const autoSelectedGameRef = useRef(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    loadDetail();
  }, [tournamentId, refreshTrigger]);

  // The card opens on the game that is being played (or the next one to play), not on game 1 (audit 2026-10-04).
  useEffect(() => {
    const list: any[] = tournament?.games || [];
    if (autoSelectedGameRef.current || list.length === 0) return;
    autoSelectedGameRef.current = true;
    const live = list.findIndex((game) => game.status === 'active');
    const next = list.findIndex((game) => game.status !== 'completed');
    const target = live >= 0 ? live : next >= 0 ? next : 0;
    if (target > 0) setSelectedGameIdx(target);
  }, [tournament]);

  const loadDetail = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const data = await api.getTournament(tournamentId);
      setTournament(data);
      setLoadError(null);
    } catch (err: any) {
      const message = err?.message || 'Ошибка загрузки турнира';
      if (silent && tournament) {
        onSilentError(message);
      } else {
        setTournament(null);
        setLoadError({
          status: typeof err?.status === 'number' ? err.status : null,
          message,
        });
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  return { tournament, setTournament, loading, loadError, selectedGameIdx, setSelectedGameIdx, refreshTrigger, refresh: () => setRefreshTrigger((prev) => prev + 1), loadDetail };
};
