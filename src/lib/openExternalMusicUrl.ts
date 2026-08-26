type TelegramWebApp = {
  openLink?: (url: string) => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

/**
 * Opens a provider-owned music page from a user gesture.
 * Telegram keeps the Mini App alive while the external page/app is open, so
 * the user can return to the game with the host's back action.
 */
export const openExternalMusicUrl = (rawUrl: string): boolean => {
  const url = String(rawUrl || '').trim();
  if (!url || typeof window === 'undefined') return false;

  const telegramWebApp = (window as TelegramWindow).Telegram?.WebApp;
  if (typeof telegramWebApp?.openLink === 'function') {
    telegramWebApp.openLink(url);
    return true;
  }

  // Same-tab navigation preserves the browser back stack outside Telegram.
  window.location.assign(url);
  return true;
};
