import { useEffect } from 'react';

type LivePlayer = { slot_num?: number; nickname?: string; role?: string };

const normalizedNames = (values: string[]) => values
  .map((value) => value.trim().toLocaleLowerCase('ru-RU'))
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b, 'ru'));

const sameNames = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

export default function BettingLiveBridge() {
  useEffect(() => {
    let busy = false;
    let lastReconcileAt = 0;

    const tick = async () => {
      if (busy) return;
      const now = Date.now();
      if (now - lastReconcileAt > 5000) {
        lastReconcileAt = now;
        void fetch('/api/games/betting/reconcile', { method: 'POST', credentials: 'include' }).catch(() => undefined);
      }

      let parsed: any = null;
      try {
        const raw = localStorage.getItem('mafia_live_session');
        parsed = raw ? JSON.parse(raw) : null;
      } catch {}
      if (!parsed || parsed.phase === 'setup') return;

      const activePlayers: LivePlayer[] = Array.isArray(parsed.activePlayers) ? parsed.activePlayers : [];
      if (activePlayers.length !== 10) return;
      const roles = activePlayers.map((player) => ({ seat_number: Number(player.slot_num), role: player.role }));
      if (roles.some((item) => !Number.isInteger(item.seat_number) || !item.role)) return;
      const liveNames = normalizedNames(activePlayers.map((player) => String(player.nickname || '')));
      if (liveNames.length !== 10) return;

      busy = true;
      try {
        const response = await fetch('/api/games?archived=0', { credentials: 'include' });
        if (!response.ok) return;
        const games = await response.json();
        const candidates = (Array.isArray(games) ? games : [])
          .filter((game: any) => game?.status === 'draft' && game?.club_protocol?.player_results?.length === 10)
          .filter((game: any) => sameNames(
            liveNames,
            normalizedNames(game.club_protocol.player_results.map((item: any) => String(item.display_name || ''))),
          ))
          .sort((a: any, b: any) => Number(b.global_game_number || b.id || 0) - Number(a.global_game_number || a.id || 0));
        const game = candidates[0];
        if (!game?.id) return;
        const storageKey = `betting_pool_opened_game_${game.id}`;
        if (sessionStorage.getItem(storageKey) === '1') return;

        const openResponse = await fetch(`/api/games/${game.id}/betting/open`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles }),
        });
        if (openResponse.ok || openResponse.status === 409) sessionStorage.setItem(storageKey, '1');
      } catch (error) {
        console.warn('[BETS] Live bridge failed to open betting pool:', error);
      } finally {
        busy = false;
      }
    };

    void tick();
    const interval = window.setInterval(() => { void tick(); }, 750);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}
