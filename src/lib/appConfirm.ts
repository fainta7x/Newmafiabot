/**
 * One confirmation window of the app for every «are you sure?» question (owner, 2026-11-08: seven native system
 * dialogs replaced). `appConfirm` asks through the mounted `AppConfirmHost`; without a host (a test, a screen that
 * does not mount it) it falls back to the browser's `window.confirm`, so a question is never silently skipped.
 */
export interface AppConfirmOptions {
  title?: string;
  confirmLabel?: string;
  /** A destructive action: the confirm button is red. */
  danger?: boolean;
}

export interface AppConfirmRequest extends AppConfirmOptions {
  message: string;
  /** A notice with one button («Понятно») instead of a question: the replacement of `alert()`. */
  info?: boolean;
  resolve: (answer: boolean) => void;
}

// A stack: the screen that mounted its host last answers; when it goes away the one below takes over.
const hosts: Array<(request: AppConfirmRequest) => void> = [];

export function registerAppConfirmHost(handler: (request: AppConfirmRequest) => void): () => void {
  hosts.push(handler);
  return () => { const at = hosts.lastIndexOf(handler); if (at >= 0) hosts.splice(at, 1); };
}

export function appConfirm(message: string, options: AppConfirmOptions = {}): Promise<boolean> {
  const ask = hosts[hosts.length - 1];
  if (!ask) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => { ask({ ...options, message, resolve }); });
}

/** One message with one button, in the app's own window (a native `alert()` can be swallowed by a Telegram WebView). */
export function appNotice(message: string, options: Pick<AppConfirmOptions, 'title'> = {}): Promise<void> {
  const ask = hosts[hosts.length - 1];
  if (!ask) { window.alert(message); return Promise.resolve(); }
  return new Promise((resolve) => { ask({ ...options, message, info: true, resolve: () => resolve() }); });
}
