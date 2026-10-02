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
const finitePositive = (value: number | undefined) => Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;

export const resolveExpandedViewportHeight = (input: {
  current?: number;
  stable?: number;
  browser?: number;
  previousExpanded?: number;
  width?: number;
  previousWidth?: number;
  expandedRoute: boolean;
}) => {
  const current = finitePositive(input.current);
  const stable = finitePositive(input.stable);
  const browser = finitePositive(input.browser);
  const width = finitePositive(input.width);
  const previousWidth = finitePositive(input.previousWidth);
  const widthChanged = previousWidth > 0 && width > 0 && Math.abs(width - previousWidth) > 80;
  const previousExpanded = widthChanged ? 0 : finitePositive(input.previousExpanded);

  if (!input.expandedRoute) {
    return { height: current || browser, widthChanged };
  }

  return {
    height: Math.max(current, stable, browser, previousExpanded),
    widthChanged,
  };
};

// Telegram Android can keep reporting the compact viewportHeight for a while after
// the Mini App is restored. Poker sizes its canvas from this CSS variable, so one
// stale compact value used to permanently make the table narrower than the phone.
// Keep the largest expanded height for the current screen width. A large width
// change means rotation / another real viewport, so the cache is reset.
let lastExpandedViewportHeight = 0;
let lastViewportWidth = 0;

const setViewportVariables = (webApp?: TelegramWebAppLike) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const style = root().style;
  const current = finitePositive(webApp?.viewportHeight);
  const stable = finitePositive(webApp?.viewportStableHeight);
  const browser = Math.max(
    finitePositive(window.visualViewport?.height),
    finitePositive(window.innerHeight),
    finitePositive(root().clientHeight),
  );
  const width = Math.max(
    finitePositive(window.visualViewport?.width),
    finitePositive(window.innerWidth),
    finitePositive(root().clientWidth),
  );
  const appRoute = isAppRoute(window.location.pathname);
  const resolved = resolveExpandedViewportHeight({
    current,
    stable,
    browser,
    previousExpanded: lastExpandedViewportHeight,
    width,
    previousWidth: lastViewportWidth,
    expandedRoute: appRoute,
  });

  if (appRoute) {
    if (resolved.widthChanged) lastExpandedViewportHeight = 0;
    if (width > 0) lastViewportWidth = width;
    lastExpandedViewportHeight = Math.max(lastExpandedViewportHeight, resolved.height);
  }

  const safe = webApp?.safeAreaInset;
  const content = webApp?.contentSafeAreaInset;

  style.setProperty('--tg-viewport-height', px(resolved.height || undefined, '100dvh'));
  style.setProperty('--tg-viewport-stable-height', px(stable || undefined, '100svh'));
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
  // Browser metrics are intentionally re-read even when Telegram exposes
  // viewportHeight: on Android that Telegram value is exactly the one that can
  // stay stale after restoring the Mini App.
  const browserUpdate = () => setViewportVariables(webApp);
  const resumeTimers = new Set<number>();
  const resyncAfterResume = () => {
    if (document.visibilityState === 'hidden') return;
    if (isAppRoute(window.location.pathname)) {
      try { webApp?.expand?.(); } catch {}
    }
    update();
    // Telegram and Chromium settle the restored viewport on different frames.
    // Re-measure several times, including after the native expand animation.
    window.requestAnimationFrame(update);
    for (const delay of [120, 360, 800]) {
      const timer = window.setTimeout(() => {
        resumeTimers.delete(timer);
        update();
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

  const telegramEvents = ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged'] as const;
  for (const event of telegramEvents) {
    try { webApp?.onEvent?.(event, update); } catch {}
  }
  window.addEventListener('resize', browserUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', browserUpdate, { passive: true });
  window.addEventListener('focus', resyncAfterResume);
  window.addEventListener('pageshow', resyncAfterResume);
  window.addEventListener('orientationchange', resyncAfterResume);
  document.addEventListener('visibilitychange', resyncAfterResume);

  cleanupSingleton = () => {
    for (const event of telegramEvents) {
      try { webApp?.offEvent?.(event, update); } catch {}
    }
    window.removeEventListener('resize', browserUpdate);
    window.visualViewport?.removeEventListener('resize', browserUpdate);
    window.removeEventListener('focus', resyncAfterResume);
    window.removeEventListener('pageshow', resyncAfterResume);
    window.removeEventListener('orientationchange', resyncAfterResume);
    document.removeEventListener('visibilitychange', resyncAfterResume);
    for (const timer of resumeTimers) window.clearTimeout(timer);
    resumeTimers.clear();
    lastExpandedViewportHeight = 0;
    lastViewportWidth = 0;
    cleanupSingleton = null;
  };
  return cleanupSingleton;
};
