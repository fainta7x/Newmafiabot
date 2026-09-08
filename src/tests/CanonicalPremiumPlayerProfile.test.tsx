/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CanonicalPremiumPlayerProfile from '../components/player/CanonicalPremiumPlayerProfile.tsx';

vi.mock('../components/player/PremiumProfileConnections.tsx', () => ({ default: () => <div data-testid="connections-stub" /> }));
vi.mock('../components/player/PremiumProfileShowcase.tsx', () => ({ default: ({ section }: any) => <div data-testid={`showcase-${section}`} /> }));
vi.mock('../components/player/SmartFriendInviteSuggestions.tsx', () => ({ default: () => <div data-testid="smart-friends-stub" /> }));
vi.mock('../components/player/PlayerAwardSuggestionAction.tsx', () => ({ default: () => <div data-testid="award-suggestion-stub" /> }));
vi.mock('../components/player/PlayerProfileCompleteness.tsx', () => ({ PlayerProfileCompletionCard: () => <div data-testid="completion-stub" /> }));

const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const summary = (id: string, nickname: string) => ({
  player: { id, nickname, elo: 1200, avatar_url: null },
  stats: { games: 12, wins: 7 },
  recent_games: [],
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CanonicalPremiumPlayerProfile', () => {
  it('ignores a stale profile response after switching players', async () => {
    let resolveOld!: (value: Response) => void;
    const oldSummary = new Promise<Response>((resolve) => { resolveOld = resolve; });
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/profiles/old/summary')) return oldSummary;
      if (url.includes('/profiles/old/birthday')) return response({ day: 1, month: 1 });
      if (url.includes('/profiles/new/summary')) return response(summary('new', 'Новый игрок'));
      if (url.includes('/profiles/new/birthday')) return response({ day: 2, month: 2 });
      return response({});
    }));

    const view = render(<CanonicalPremiumPlayerProfile playerId="old" selfPlayerId="self" />);
    view.rerender(<CanonicalPremiumPlayerProfile playerId="new" selfPlayerId="self" />);

    expect(await screen.findByText('Новый игрок')).toBeDefined();
    resolveOld(new Response(JSON.stringify(summary('old', 'Старый игрок')), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    expect(screen.queryByText('Старый игрок')).toBeNull();
    expect(screen.getByText('Новый игрок')).toBeDefined();
  });

  it('sends canonical enumerated game filters', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/summary')) return response(summary('self', 'Игрок'));
      if (url.includes('/birthday')) return response({});
      if (url.includes('/games?')) return response({ games: [], total: 0 });
      return response({});
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CanonicalPremiumPlayerProfile playerId="self" selfPlayerId="self" mode="self" />);
    await screen.findByText('Игрок');
    fireEvent.click(screen.getByRole('button', { name: 'Игры' }));
    fireEvent.click(screen.getByText('Дополнительные фильтры'));
    fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'sheriff' } });
    fireEvent.change(screen.getByLabelText('Команда'), { target: { value: 'black' } });
    fireEvent.change(screen.getByLabelText('Результат'), { target: { value: 'win' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => {
      const value = String(url);
      return value.includes('role=sheriff') && value.includes('team=black') && value.includes('result=win');
    })).toBe(true));
  });

  it('renders elo_after as the primary Elo value and keeps before/delta metadata', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/summary')) return response(summary('self', 'Игрок'));
      if (url.includes('/birthday')) return response({});
      if (url.includes('/elo?')) return response({ points: [{ id: 'club:g1', title: 'Игра 7', game_number: 7, date: '2026-09-01T18:00:00.000Z', elo_before: 1190, elo_after: 1205, elo_delta: 15 }] });
      return response({});
    }));
    render(<CanonicalPremiumPlayerProfile playerId="self" selfPlayerId="self" mode="self" />);
    await screen.findByText('Игрок');
    fireEvent.click(screen.getByRole('button', { name: 'Elo' }));
    expect(await screen.findByText('1205')).toBeDefined();
    expect(screen.getByText('+15')).toBeDefined();
    expect(screen.getByText(/До игры: 1190/)).toBeDefined();
  });

  it('shows owner-only award suggestion and smart friend suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => String(input).includes('/summary') ? response(summary('self', 'Игрок')) : response({})));
    render(<CanonicalPremiumPlayerProfile playerId="self" selfPlayerId="self" mode="self" />);
    await screen.findByText('Игрок');
    fireEvent.click(screen.getByRole('button', { name: 'Награды' }));
    expect(screen.getByTestId('award-suggestion-stub')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Связи' }));
    expect(screen.getByTestId('smart-friends-stub')).toBeDefined();
  });
});
