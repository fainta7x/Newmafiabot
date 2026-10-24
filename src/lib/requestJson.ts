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
 * Same-origin JSON read for a lookup that may simply not find anything (a «try this kind of record, then the next» probe):
 * a non-OK answer is `null`, not an error. A network failure still throws, like `getJson`.
 */
export async function getJsonIfOk<T = any>(url: string, init: { cache?: RequestCache } = {}): Promise<T | null> {
  const response = await fetch(url, { credentials: 'include', ...init });
  const body = await response.json().catch(() => ({}));
  return response.ok ? (body as T) : null;
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

/**
 * Same-origin JSON request with any `init` (method, body, extra headers); a JSON content type is always sent.
 * `nullOn204` returns null for an empty 204 answer. Replaces the identical local `request` helpers of CRM cards.
 */
export async function requestJson<T = any>(
  url: string,
  init: RequestInit | undefined,
  fallbackError: string,
  options: { nullOn204?: boolean } = {},
): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (options.nullOn204 && response.status === 204) return null as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestJsonError(body?.error || fallbackError, response.status, body);
  return body as T;
}
