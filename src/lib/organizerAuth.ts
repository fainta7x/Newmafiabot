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
