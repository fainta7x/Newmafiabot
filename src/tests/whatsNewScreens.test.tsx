/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WhatsNewCard from '../components/player/WhatsNewCard.tsx';
import { WhatsNewCRM } from '../components/crm/WhatsNewCRM.tsx';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }));

beforeEach(() => { try { window.localStorage.clear(); } catch { /* none */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('«Что нового» for players', () => {
  it('is hidden while nothing is published', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ entries: [] })));
    const { container } = render(<WhatsNewCard />);
    await waitFor(() => expect((fetch as any).mock.calls.length).toBe(1));
    expect(container.textContent).toBe('');
  });

  it('shows the newest title with an unread count, lists the notices and forgets the count once opened', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ entries: [
      { id: 'b', title: 'Второе', body: 'Текст второго', published_at: '2026-10-13T10:00:00.000Z' },
      { id: 'a', title: 'Первое', body: '', published_at: '2026-10-12T10:00:00.000Z' },
    ] })));
    render(<WhatsNewCard />);
    expect((await screen.findByTestId('player-home-whats-new')).textContent).toContain('Второе');
    expect(screen.getByTestId('whats-new-unread').textContent).toBe('2');
    fireEvent.click(screen.getByTestId('player-home-whats-new'));
    expect(await screen.findAllByTestId('whats-new-entry')).toHaveLength(2);
    expect(screen.queryByTestId('whats-new-unread')).toBeNull();
  });
});

describe('«Что нового» in the CRM', () => {
  it('lists drafts and published notices, creates one, publishes and deletes', async () => {
    let entries = [
      { id: 'd1', title: 'Черновик про покер', body: 'Текст', published: false, published_at: null, created_at: '2026-10-13T08:00:00Z' },
      { id: 'p1', title: 'Уже опубликовано', body: '', published: true, published_at: '2026-10-12T08:00:00Z', created_at: '2026-10-12T08:00:00Z' },
    ];
    const calls: Array<{ url: string; method: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method || 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.endsWith('/all')) return json({ entries });
      if (method === 'POST') { entries = [{ id: 'n1', title: 'Новая', body: 'x', published: false, published_at: null, created_at: '2026-10-13T09:00:00Z' }, ...entries]; return json({ entry: entries[0] }, 201); }
      if (method === 'PATCH') { entries = entries.map((entry) => (entry.id === 'd1' ? { ...entry, published: true, published_at: '2026-10-13T09:30:00Z' } : entry)); return json({ entry: entries[0] }); }
      if (method === 'DELETE') { entries = entries.filter((entry) => entry.id !== 'p1'); return json(null, 204); }
      return json({});
    }));
    render(<WhatsNewCRM />);
    expect(await screen.findByText('Черновик про покер')).toBeTruthy();
    expect(screen.getByText('Видят игроки · 1')).toBeTruthy();

    fireEvent.click(screen.getByTestId('whats-new-add'));
    fireEvent.change(await screen.findByLabelText('Заголовок'), { target: { value: 'Новая' } });
    fireEvent.change(screen.getByLabelText('Текст'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.body.title === 'Новая' && call.body.published === false)).toBe(true));

    fireEvent.click((await screen.findAllByRole('button', { name: 'Опубликовать' }))[1]);
    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH' && call.body.published === true)).toBe(true));

    fireEvent.click((await screen.findAllByRole('button', { name: 'Удалить' }))[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить', hidden: false }));
  });
});
