import { requestJson } from './requestJson.ts';
/**
 * Request headers of the organizer session (architecture programme, 2026-10-26): one definition instead of eleven copies.
 * The organizer's bearer token, when this device keeps one in `organizer_token`, goes as `Authorization`; `json` adds the
 * JSON content type. Without a window (server, tests) only the content type is set.
 */
export const organizerHeaders = (json = true): Record<string, string> => {
  const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

/**
 * A JSON request of the organizer session: the organizer headers plus `requestJson`'s failure handling (the server's
 * `error` text, otherwise the caller's fallback). Replaces the hand-written `fetch` + `organizerHeaders` +
 * `if (!response.ok) throw new Error(body?.error || '…')` blocks one for one.
 */
export const organizerJson = <T = any>(url: string, fallbackError: string, init: RequestInit = {}): Promise<T> =>
  requestJson<T>(url, { ...init, headers: { ...organizerHeaders(false), ...(init.headers as Record<string, string> || {}) } }, fallbackError);
