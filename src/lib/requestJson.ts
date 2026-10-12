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
export async function getJson<T = any>(url: string, fallbackError: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestJsonError(body?.error || fallbackError, response.status, body);
  return body as T;
}
