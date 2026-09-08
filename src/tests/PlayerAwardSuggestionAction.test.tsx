/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerAwardSuggestionAction from '../components/player/PlayerAwardSuggestionAction.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PlayerAwardSuggestionAction', () => {
  it('submits an existing verified award as a correction instead of creating a new award suggestion', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/verified-awards')) {
        return new Response(JSON.stringify({ awards: [{ id: 'award-1', kind: 'medal', title: 'MVP', tournament_name: 'Осенний кубок', description: 'Старое описание' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/award-suggestions') && init?.method === 'POST') {
        return new Response(JSON.stringify({ suggestion: { id: 'suggestion-1' } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<PlayerAwardSuggestionAction />);
    fireEvent.click(screen.getByRole('button', { name: 'Предложить награду или исправление' }));
    fireEvent.click(screen.getByRole('button', { name: 'Исправление' }));
    await screen.findByRole('option', { name: /MVP/ });
    fireEvent.change(screen.getByLabelText('Награда для исправления'), { target: { value: 'award-1' } });
    fireEvent.change(screen.getByPlaceholderText('Что нужно исправить'), { target: { value: 'Исправить описание' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить на проверку' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => String(url).includes('/award-suggestions') && init?.method === 'POST');
      expect(call).toBeDefined();
      const payload = JSON.parse(String(call?.[1]?.body || '{}'));
      expect(payload.suggestion_type).toBe('correction');
      expect(payload.award_id).toBe('award-1');
      expect(payload.kind).toBe('medal');
    });
  });
});
