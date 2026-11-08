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
  resolve: (answer: boolean) => void;
}

let host: ((request: AppConfirmRequest) => void) | null = null;

export function registerAppConfirmHost(handler: (request: AppConfirmRequest) => void): () => void {
  host = handler;
  return () => { if (host === handler) host = null; };
}

export function appConfirm(message: string, options: AppConfirmOptions = {}): Promise<boolean> {
  if (!host) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => host!({ ...options, message, resolve }));
}
