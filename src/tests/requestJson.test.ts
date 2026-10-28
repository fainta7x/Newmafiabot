import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson, getJsonIfOk, readJsonResponse, RequestJsonError, requestJson, sendJson } from '../lib/requestJson.ts';

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

describe('existing response compatibility', () => {
  it('keeps message-only failures opt-in and gives error priority', async () => {
    const response = (body: unknown) => new Response(JSON.stringify(body), { status: 409 });
    await expect(readJsonResponse(response({ message: 'Прежнее сообщение' }), 'fallback')).rejects.toMatchObject({ message: 'fallback', status: 409 });
    await expect(readJsonResponse(response({ message: 'Прежнее сообщение' }), 'fallback', { messageFallback: true })).rejects.toMatchObject({ message: 'Прежнее сообщение', status: 409, body: { message: 'Прежнее сообщение' } });
    await expect(readJsonResponse(response({ error: 'Ошибка', message: 'Сообщение' }), 'fallback', { messageFallback: true })).rejects.toThrow('Ошибка');
  });

  it('preserves successful null and empty/non-JSON body fallbacks', async () => {
    await expect(readJsonResponse(new Response('null'), 'fallback')).resolves.toBeNull();
    await expect(readJsonResponse(new Response(null, { status: 204 }), 'fallback')).resolves.toEqual({});
    await expect(readJsonResponse(new Response('not JSON', { status: 502 }), 'Сеть недоступна')).rejects.toMatchObject({ message: 'Сеть недоступна', status: 502, body: {} });
  });
});

describe('getJson', () => {
  it('returns the parsed body and sends the cookie session', async () => {
    const fetchMock = mockFetch(200, { games: [1] });
    await expect(getJson('/api/x', 'fallback')).resolves.toEqual({ games: [1] });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { credentials: 'include' });
  });

  it('passes no-store through when the caller needs a fresh read', async () => {
    const fetchMock = mockFetch(200, {});
    await getJson('/api/x', 'fallback', { cache: 'no-store' });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { credentials: 'include', cache: 'no-store' });
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

describe('sendJson', () => {
  it('sends the payload as JSON with the cookie session', async () => {
    const fetchMock = mockFetch(200, { ok: true });
    await expect(sendJson('/api/x', 'PATCH', { a: 1 }, 'fallback')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
  });

  it('sends no body and no content type without a payload', async () => {
    const fetchMock = mockFetch(200, {});
    await sendJson('/api/x', 'POST', undefined, 'fallback');
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { method: 'POST', credentials: 'include' });
  });

  it('throws the server error text, else the fallback', async () => {
    mockFetch(409, { error: 'Уже есть' });
    await expect(sendJson('/api/x', 'DELETE', undefined, 'fallback')).rejects.toMatchObject({ message: 'Уже есть', status: 409 });
    mockFetch(500, null, true);
    await expect(sendJson('/api/x', 'PUT', {}, 'Не удалось сохранить')).rejects.toThrow('Не удалось сохранить');
  });
});

describe('requestJson', () => {
  it('keeps the caller init, always sends JSON and merges extra headers', async () => {
    const fetchMock = mockFetch(200, { saved: true });
    await expect(requestJson('/api/x', { method: 'PUT', body: '{}', headers: { 'X-Test': '1' } }, 'fallback')).resolves.toEqual({ saved: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', {
      credentials: 'include', method: 'PUT', body: '{}', headers: { 'Content-Type': 'application/json', 'X-Test': '1' },
    });
  });

  it('returns null for 204 only when asked', async () => {
    mockFetch(204, {});
    await expect(requestJson('/api/x', { method: 'DELETE' }, 'fallback', { nullOn204: true })).resolves.toBeNull();
    mockFetch(204, {});
    await expect(requestJson('/api/x', { method: 'DELETE' }, 'fallback')).resolves.toEqual({});
  });

  it('throws the server error text, else the fallback', async () => {
    mockFetch(400, { error: 'Пусто' });
    await expect(requestJson('/api/x', undefined, 'Не получилось')).rejects.toThrow('Пусто');
    mockFetch(500, null, true);
    await expect(requestJson('/api/x', undefined, 'Не получилось')).rejects.toThrow('Не получилось');
  });
});

describe('getJsonIfOk', () => {
  it('returns the body on success and sends the cookie session', async () => {
    const fetchMock = mockFetch(200, { id: 'x' });
    expect(await getJsonIfOk('/api/x', { cache: 'no-store' })).toEqual({ id: 'x' });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { credentials: 'include', cache: 'no-store' });
  });

  it('returns null for a non-OK answer instead of throwing, whatever the body is', async () => {
    mockFetch(404, { error: 'нет' });
    expect(await getJsonIfOk('/api/x')).toBeNull();
    mockFetch(500, null, true);
    expect(await getJsonIfOk('/api/x')).toBeNull();
  });

  it('still throws on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(getJsonIfOk('/api/x')).rejects.toThrow('offline');
  });
});
