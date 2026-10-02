type Insets = { top?: number; bottom?: number; left?: number; right?: number };

type TelegramWebAppLike = {
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  onEvent?: (event: string, callback: (...args: any[]) => void) => void;
  offEvent?: (event: string, callback: (...args: any[]) => void) => void;
};

type TelegramWindow = Window & { Telegram?: { WebApp?: TelegramWebAppLike } };

export const TELEGRAM_VIEWPORT_CHANGE_EVENT = 'telegramviewportchange';

const root = () => document.documentElement;
const px = (value: number | undefined, fallback: string) => Number.isFinite(value) ? `${Math.max(0, Number(value))}px` : fallback;
const isAppRoute = (pathname: string) => pathname === '/player' || pathname.startsWith('/player/') || pathname === '/admin' || pathname.startsWith('/admin/');

const setViewportVariables = (webApp?: TelegramWebAppLike) => {
  if (typeof document === 'undefined') return;
  const style = root().style;
  const current = webApp?.viewportHeight;
  const stable = webApp?.viewportStableHeight;
  const safe = webApp?.safeAreaInset;
  const content = webApp?.contentSafeAreaInset;

  style.setProperty('--tg-viewport-height', px(current, '100dvh'));
  style.setProperty('--tg-viewport-stable-height', px(stable, '100svh'));
  style.setProperty('--tg-safe-area-top', px(safe?.top, 'env(safe-area-inset-top, 0px)'));
  style.setProperty('--tg-safe-area-bottom', px(safe?.bottom, 'env(safe-area-inset-bottom, 0px)'));
  style.setProperty('--tg-safe-area-left', px(safe?.left, 'env(safe-area-inset-left, 0px)'));
  style.setProperty('--tg-safe-area-right', px(safe?.right, 'env(safe-area-inset-right, 0px)'));
  style.setProperty('--tg-content-safe-area-top', px(content?.top ?? safe?.top, 'env(safe-area-inset-top, 0px)'));
  style.setProperty('--tg-content-safe-area-bottom', px(content?.bottom ?? safe?.bottom, 'env(safe-area-inset-bottom, 0px)'));
  style.setProperty('--tg-content-safe-area-left', px(content?.left ?? safe?.left, 'env(safe-area-inset-left, 0px)'));
  style.setProperty('--tg-content-safe-area-right', px(content?.right ?? safe?.right, 'env(safe-area-inset-right, 0px)'));
  window.dispatchEvent(new Event(TELEGRAM_VIEWPORT_CHANGE_EVENT));
};

let cleanupSingleton: (() => void) | null = null;

export const initializeTelegramWebAppViewport = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (cleanupSingleton) return cleanupSingleton;

  const telegramWindow = window as TelegramWindow;
  const webApp = telegramWindow.Telegram?.WebApp;
  const update = () => setViewportVariables(webApp);
  const browserUpdate = () => {
    if (!webApp?.viewportHeight) {
      const height = window.visualViewport?.height || window.innerHeight;
      root().style.setProperty('--tg-viewport-height', `${Math.max(0, height)}px`);
    }
    if (!webApp?.viewportStableHeight) root().style.setProperty('--tg-viewport-stable-height', '100svh');
    window.dispatchEvent(new Event(TELEGRAM_VIEWPORT_CHANGE_EVENT));
  };
  const resumeTimers = new Set<number>();
  const resyncAfterResume = () => {
    if (document.visibilityState === 'hidden') return;
    if (isAppRoute(window.location.pathname)) {
      try { webApp?.expand?.(); } catch {}
    }
    update();
    browserUpdate();
    // Telegram updates viewportHeight asynchronously after a Mini App returns
    // from the background. Re-read it after both the first paint and the end of
    // the native expand animation instead of keeping the transient compact size.
    window.requestAnimationFrame(() => {
      update();
      browserUpdate();
    });
    for (const delay of [120, 360]) {
      const timer = window.setTimeout(() => {
        resumeTimers.delete(timer);
        update();
        browserUpdate();
      }, delay);
      resumeTimers.add(timer);
    }
  };

  // Telegram recommends notifying readiness as soon as the UI can take ownership.
  try { webApp?.ready?.(); } catch {}
  if (isAppRoute(window.location.pathname)) {
    try { webApp?.expand?.(); } catch {}
    try { webApp?.disableVerticalSwipes?.(); } catch {}
  }

  update();
  browserUpdate();

  const telegramEvents = ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged'] as const;
  for (const event of telegramEvents) {
    try { webApp?.onEvent?.(event, update); } catch {}
  }
  window.addEventListener('resize', browserUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', browserUpdate, { passive: true });
  window.addEventListener('focus', resyncAfterResume);
  window.addEventListener('pageshow', resyncAfterResume);
  document.addEventListener('visibilitychange', resyncAfterResume);

  cleanupSingleton = () => {
    for (const event of telegramEvents) {
      try { webApp?.offEvent?.(event, update); } catch {}
    }
    window.removeEventListener('resize', browserUpdate);
    window.visualViewport?.removeEventListener('resize', browserUpdate);
    window.removeEventListener('focus', resyncAfterResume);
    window.removeEventListener('pageshow', resyncAfterResume);
    document.removeEventListener('visibilitychange', resyncAfterResume);
    for (const timer of resumeTimers) window.clearTimeout(timer);
    resumeTimers.clear();
    cleanupSingleton = null;
  };
  return cleanupSingleton;
};
