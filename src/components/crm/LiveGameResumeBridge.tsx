import { useEffect } from 'react';

const hasActiveLiveGame = () => Boolean(document.querySelector('.evening-live-engine-shell'));

export const requestTelegramLiveFullscreen = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !hasActiveLiveGame()) return;
  const webApp = (window as any).Telegram?.WebApp;
  try {
    webApp?.ready?.();
    webApp?.expand?.();
  } catch {}
};

/**
 * Telegram may restore a Mini App with a stale collapsed viewport after the
 * user switches away and comes back. Live Game itself must stay mounted and
 * keep its local state; this bridge only asks the host to re-expand the active
 * judge surface when it is visible again.
 */
export default function LiveGameResumeBridge() {
  useEffect(() => {
    let activePreviously = hasActiveLiveGame();

    const restoreIfVisible = () => {
      if (document.visibilityState === 'visible') requestTelegramLiveFullscreen();
    };

    const observer = new MutationObserver(() => {
      const activeNow = hasActiveLiveGame();
      if (activeNow && !activePreviously && document.visibilityState === 'visible') {
        requestTelegramLiveFullscreen();
      }
      activePreviously = activeNow;
    });
    observer.observe(document.body, { childList: true, subtree: true });

    restoreIfVisible();
    document.addEventListener('visibilitychange', restoreIfVisible);
    window.addEventListener('pageshow', restoreIfVisible);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', restoreIfVisible);
      window.removeEventListener('pageshow', restoreIfVisible);
    };
  }, []);

  return null;
}
