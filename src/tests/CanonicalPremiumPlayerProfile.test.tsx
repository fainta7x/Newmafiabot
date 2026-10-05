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

  it('renders elo_after as the primary Elo value with the rounded delta (the old «До игры» line duplicated them)', async () => {
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
    expect(screen.queryByText(/До игры/)).toBeNull();
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

  it('shows the games with Russian labels, the title, the Elo change and a link to the game', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/summary')) return response(summary('self', 'Игрок'));
      if (url.includes('/birthday')) return response({});
      if (url.includes('/games?')) return response({ total: 1, games: [{ id: 'club:g9', title: 'Вечер 3 октября', game_number: 4, date: '2026-10-03T18:00:00.000Z', role: 'mafia', team: 'black', won: true, elo_delta: 12.4, protocol_path: '/player/games?game=club%3Ag9' }] });
      return response({});
    }));
    render(<CanonicalPremiumPlayerProfile playerId="self" selfPlayerId="self" mode="self" />);
    await screen.findByText('Игрок');
    fireEvent.click(screen.getByRole('button', { name: 'Игры' }));
    expect(await screen.findByText(/Вечер 3 октября · №4/)).toBeDefined();
    expect(screen.getByText(/Мафия · Чёрные · победа/)).toBeDefined();
    expect(screen.queryByText('mafia')).toBeNull();
    expect(screen.getByText('Elo +12')).toBeDefined();
    expect(screen.getByRole('link', { name: /Открыть игру/ }).getAttribute('href')).toBe('/player/games?game=club%3Ag9');
  });

  it('says so when another player has hidden his statistics instead of showing dashes', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/summary')) return response({ player: { id: 'other', nickname: 'Скрытный', elo: null, avatar_url: null }, stats: null, recent_games: [] });
      if (url.includes('/birthday')) return response({});
      if (url.includes('/elo?')) return response({ error: 'Игровая статистика скрыта игроком' }, 403);
      return response({});
    }));
    render(<CanonicalPremiumPlayerProfile playerId="other" selfPlayerId="self" mode="public" />);
    await screen.findByText('Скрытный');
    expect(screen.getByTestId('profile-stats-hidden')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Elo' }));
    expect(await screen.findByText('Игровая статистика скрыта игроком')).toBeDefined();
    expect(screen.queryByText(/Истории Elo пока нет/)).toBeNull();
  });

  it('carries the former «Карьера» numbers in the overview: streaks, season, red and black', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/summary')) return response({
        ...summary('self', 'Игрок'),
        stats: { games: 21, wins: 12, win_rate: 57, current_streak: 3, best_streak: 5, red: { games: 15, wins: 9, win_rate: 60 }, black: { games: 6, wins: 3, win_rate: 50 }, first_killed: 2, best_moves: 1, zero_round_voted: 0 },
        season: { label: 'Осень 2026', games: 4, wins: 3, win_rate: 75, place: 2, total_players: 18 },
        game_stats: { games: 21, votesAsRed: { count: 5, total: 7, percent: 71 }, nominationsAsRed: { count: 0, total: 0, percent: null }, bestMove: { count: 0, averageBlack: null, withBlack: { count: 0, total: 0, percent: null } }, firstKilled: { count: 0, total: 0, percent: null }, sheriffChecks: { count: 0, total: 0, percent: null }, donChecks: { count: 0, total: 0, percent: null } },
      });
      if (url.includes('/birthday')) return response({});
      return response({});
    }));
    render(<CanonicalPremiumPlayerProfile playerId="self" selfPlayerId="self" mode="self" />);
    await screen.findByText('Игрок');
    expect(await screen.findByText('Осень 2026')).toBeDefined();
    expect(screen.getByText('#2')).toBeDefined();
    expect(screen.getByText('рекорд серии')).toBeDefined();
    expect(screen.getByText('За красных')).toBeDefined();
    expect(screen.getByText(/По 21 игре с журналом ходов/)).toBeDefined();
  });
});
