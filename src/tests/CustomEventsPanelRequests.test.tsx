/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomEventsPanel from '../components/crm/CustomEventsPanel';

const draft = { id: 'e1', title: 'Квиз', status: 'draft', starts_at: '2026-11-01T16:00:00+03:00', venue: 'Бар', participant_count: 0, participant_limit: 20, registration_open: 1 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let calls: Array<{ url: string; init?: RequestInit }>;
const mockFetch = (handler: (url: string, init?: RequestInit) => Response) => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url: String(url), init }); return handler(String(url), init); }));
};

beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('custom events panel requests', () => {
  it('loads the list with the session cookie', async () => {
    mockFetch(() => json([draft]));
    render(<CustomEventsPanel />);
    expect(await screen.findByText('Квиз')).toBeTruthy();
    expect(calls[0].url).toBe('/api/custom-events/manage');
    expect(calls[0].init?.credentials).toBe('include');
  });

  it('publishing posts the status and reloads; a refusal shows the server text', async () => {
    let fail = false;
    mockFetch((url) => (url.endsWith('/status') ? (fail ? json({ error: 'Нужен адрес' }, 400) : json({})) : json([draft])));
    render(<CustomEventsPanel />);
    await screen.findByText('Квиз');
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/custom-events/e1/status')).toBe(true));
    const post = calls.find((c) => c.url === '/api/custom-events/e1/status')!;
    expect(post.init?.method).toBe('POST');
    expect(JSON.parse(String(post.init?.body))).toEqual({ status: 'published' });
    fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    expect(await screen.findByText('Нужен адрес')).toBeTruthy();
  });

  it('deleting a draft sends DELETE; a failure without a server text says the fallback', async () => {
    let fail = false;
    mockFetch((url, init) => (init?.method === 'DELETE' ? (fail ? new Response('boom', { status: 500 }) : json({})) : json([draft])));
    render(<CustomEventsPanel />);
    await screen.findByText('Квиз');
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true));
    expect(calls.find((c) => c.init?.method === 'DELETE')!.url).toBe('/api/custom-events/e1');
    fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(await screen.findByText('Не удалось удалить ивент')).toBeTruthy();
  });

  it('a failed list load shows the server text', async () => {
    mockFetch(() => json({ error: 'Нет доступа' }, 403));
    render(<CustomEventsPanel />);
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
  });
});
