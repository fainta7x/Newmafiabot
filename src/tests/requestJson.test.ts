import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson, RequestJsonError } from '../lib/requestJson.ts';

const mockFetch = (status: number, body: unknown, jsonThrows = false) => {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => { if (jsonThrows) throw new Error('bad json'); return body; },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe('getJson', () => {
  it('returns the parsed body and sends the cookie session', async () => {
    const fetchMock = mockFetch(200, { games: [1] });
    await expect(getJson('/api/x', 'fallback')).resolves.toEqual({ games: [1] });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { credentials: 'include' });
  });

  it('throws the server error text when present', async () => {
    mockFetch(403, { error: 'Нет доступа' });
    await expect(getJson('/api/x', 'fallback')).rejects.toMatchObject({ message: 'Нет доступа', status: 403 });
  });

  it('uses the caller fallback when the body has no error or is not JSON', async () => {
    mockFetch(500, {});
    await expect(getJson('/api/x', 'Не удалось загрузить')).rejects.toThrow('Не удалось загрузить');
    mockFetch(502, null, true);
    const error = await getJson('/api/x', 'Не удалось загрузить').catch((e) => e);
    expect(error).toBeInstanceOf(RequestJsonError);
    expect(error.message).toBe('Не удалось загрузить');
  });
});
