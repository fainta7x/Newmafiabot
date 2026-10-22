export class RequestJsonError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any = null) {
    super(message);
    this.name = 'RequestJsonError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Same-origin JSON read with the cookie session. The failure message is the server's `error` text,
 * otherwise the caller's Russian fallback, exactly like the hand-written
 * `if (!response.ok) throw new Error(body?.error || '…')` blocks it replaces.
 */
export async function getJson<T = any>(url: string, fallbackError: string, init: { cache?: RequestCache } = {}): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestJsonError(body?.error || fallbackError, response.status, body);
  return body as T;
}

/**
 * Same-origin JSON write with the cookie session: `payload` (when given) is sent as JSON. Failure handling is the
 * same as `getJson`, so it replaces the hand-written `fetch(…, { method, credentials, headers, body })` +
 * `if (!response.ok) throw new Error(body?.error || '…')` blocks one for one.
 */
export async function sendJson<T = any>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  payload: unknown,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(url, payload === undefined
    ? { method, credentials: 'include' }
    : { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestJsonError(body?.error || fallbackError, response.status, body);
  return body as T;
}
