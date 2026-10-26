/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { organizerHeaders } from '../lib/organizerAuth';

afterEach(() => localStorage.clear());

describe('organizer request headers', () => {
  it('send the JSON type and the stored organizer token', () => {
    expect(organizerHeaders()).toEqual({ 'Content-Type': 'application/json' });
    expect(organizerHeaders(false)).toEqual({});
    localStorage.setItem('organizer_token', 'abc');
    expect(organizerHeaders()).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer abc' });
    expect(organizerHeaders(false)).toEqual({ Authorization: 'Bearer abc' });
  });
});

describe('organizer JSON request', () => {
  it('sends the organizer token with the cookie and reports the server error text', async () => {
    const { organizerJson } = await import('../lib/organizerAuth');
    localStorage.setItem('organizer_token', 'abc');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'Нет прав' }), { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(organizerJson('/api/x', 'Не удалось', { method: 'POST', body: '{}' })).rejects.toThrow('Нет прав');
    const [url, init] = (fetchMock.mock.calls[0] as any[]);
    expect(url).toBe('/api/x');
    expect(init).toMatchObject({ method: 'POST', body: '{}', credentials: 'include' });
    expect(init.headers).toMatchObject({ Authorization: 'Bearer abc', 'Content-Type': 'application/json' });
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(organizerJson('/api/x', 'Не удалось')).rejects.toThrow('Не удалось');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    await expect(organizerJson('/api/x', 'Не удалось')).resolves.toEqual({ ok: 1 });
    vi.unstubAllGlobals();
  });
});
