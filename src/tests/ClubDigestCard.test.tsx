// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClubDigestCard } from '../components/crm/ClubDigestCard';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const state = { max_length: 3800, recent: [], destinations: [
  { id: 'club', name: 'Группа клуба', ready: true }, { id: 'public', name: 'Входной канал', ready: true },
  { id: 'rating', name: 'Рейтинг и турниры', ready: true }, { id: 'novice', name: 'Игры для новичков', ready: false },
] };

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('CRM card «Сводка для игроков»', () => {
  it('publishes only after the confirmation, to the selected group, and shows the result', async () => {
    const calls: Array<{ method: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method || 'GET';
      calls.push({ method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === 'POST') return json({ results: [{ destination: 'club', status: 'sent' }] });
      return json(state);
    }));
    render(<ClubDigestCard />);
    const text = await screen.findByTestId('club-digest-text');
    expect(screen.getByTestId('club-digest-publish').hasAttribute('disabled')).toBe(true);
    fireEvent.change(text, { target: { value: '🎭 Что нового: профиль теперь один на всё.' } });
    expect(screen.getByTestId('club-digest-publish').hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByTestId('club-digest-publish'));
    expect(await screen.findByText('Опубликовать сводку?')).toBeTruthy();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.body.destinations.join() === 'club')).toBe(true));
    expect((await screen.findByTestId('club-digest-results')).textContent).toContain('Группа клуба: отправлено');
  });

  it('cannot publish a digest that is too short or without a destination, and an unconfigured group cannot be ticked', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(state)));
    render(<ClubDigestCard />);
    const text = await screen.findByTestId('club-digest-text');
    fireEvent.change(text, { target: { value: 'коротко' } });
    expect(screen.getByTestId('club-digest-publish').hasAttribute('disabled')).toBe(true);
    fireEvent.change(text, { target: { value: 'Достаточно длинная сводка про новое в приложении.' } });
    const novice = screen.getByLabelText(/Игры для новичков/) as HTMLInputElement;
    expect(novice.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Группа клуба/));
    expect(screen.getByTestId('club-digest-publish').hasAttribute('disabled')).toBe(true);
  });

  it('is hidden for a user who is not the club owner', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'Сводку публикует владелец клуба' }, 403)));
    const { container } = render(<ClubDigestCard />);
    await waitFor(() => expect(container.querySelector('[data-testid="club-digest-card"]')).toBeNull());
  });
});
