/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RatingPeriodsCRM } from '../components/crm/RatingPeriodsCRM.tsx';

const seasons = [
  { id: 'a', title: 'Сезон А', type: 'RATING', starts_at: '2026-01-01T00:00:00+03:00', ends_at: '2027-12-31T23:59:59+03:00', status: 'active', auto_include: true },
  { id: 'b', title: 'Сезон Б', type: 'RATING', starts_at: '2026-01-01T00:00:00+03:00', ends_at: '2027-12-31T23:59:59+03:00', status: 'active', auto_include: true },
];

const respond = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

type Reply = (body: unknown) => void;
const pending = new Map<string, Reply[]>();
const requests: string[] = [];

const push = (path: string, resolve: (value: Response) => void) => {
  pending.set(path, [...(pending.get(path) || []), (body) => resolve(respond(body))]);
};
const take = (path: string, body: unknown) => {
  const replies = pending.get(path) || [];
  const next = replies.shift();
  if (!next) throw new Error(`No pending request: ${path}`);
  next(body);
};

const seasonPaths = (id: string) => [
  `/api/rating-periods/${id}/evenings`,
  `/api/rating-periods/${id}/games`,
  `/api/rating-periods/${id}/standings`,
];

const dataFor = (id: string) => [
  { evenings: [{
    id: `eve-${id}`, title: `Вечер ${id === 'a' ? 'А' : 'Б'}`,
    starts_at: '2026-10-18T18:00:00+03:00', format: 'RATING', status: 'completed',
    games_count: 1, auto_included: true, override_included: null, effective_included: true,
  }] },
  { games: [{
    id: id === 'a' ? 1 : 2, global_game_number: id === 'a' ? 11 : 22,
    game_date: '2026-10-18T18:00:00+03:00', winner_team: 'red',
    evening_id: `eve-${id}`, evening_title: `Вечер ${id === 'a' ? 'А' : 'Б'}`,
    starts_at: '2026-10-18T18:00:00+03:00', format: 'RATING',
    auto_included: true, evening_override_included: null, game_override_included: null,
    effective_included: true,
  }] },
  {
    selected_games_count: 1, completed_games_count: 1, distance_games: 1,
    ci_threshold_b: 5, warnings: [], standings: [{
      place: 1, player_id: `player-${id}`, nickname: `Игрок ${id === 'a' ? 'А' : 'Б'}`,
      total_points: 8, additional_total: 0, wins: 1, don_wins: 0,
      sheriff_wins: 0, first_killed_count: 0, games_played: 1,
      ci_points: 0, tie_group_id: null,
    }],
  },
];

const settleSeason = async (id: string) => {
  await act(async () => {
    const paths = seasonPaths(id);
    const data = dataFor(id);
    paths.forEach((path, i) => take(path, data[i]));
    await Promise.resolve();
  });
};

const waitSeason = async (id: string) => {
  await waitFor(() => {
    for (const path of seasonPaths(id)) expect((pending.get(path) || []).length).toBeGreaterThan(0);
  });
};

const selectB = () => fireEvent.click(screen.getByRole('button', { name: /Сезон Б/ }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  pending.clear();
  requests.length = 0;
});

const mount = () => {
  vi.stubGlobal('fetch', vi.fn((input: string | URL) => {
    const path = String(input);
    requests.push(path);
    if (path === '/api/rating-periods') return Promise.resolve(respond(seasons));
    return new Promise<Response>((resolve) => { push(path, resolve); });
  }));
  render(<RatingPeriodsCRM />);
};

describe('CRM rating season request isolation', () => {
  it('keeps B standings and inclusion controls when A responds after B', async () => {
    mount();
    await waitSeason('a');
    selectB();
    await waitSeason('b');
    await settleSeason('b');
    expect(await screen.findByText('Игрок Б')).toBeDefined();
    expect(await screen.findByText('Вечер Б')).toBeDefined();

    await settleSeason('a');
    expect(await screen.findByText('Игрок Б')).toBeDefined();
    expect(await screen.findByText('Вечер Б')).toBeDefined();
    expect(screen.queryByText('Игрок А')).toBeNull();
    expect(screen.queryByText('Вечер А')).toBeNull();
  });

  it('never shows A under B even while B is loading; collapse invalidates pending details', async () => {
    mount();
    await waitSeason('a');
    await settleSeason('a');
    expect(await screen.findByText('Игрок А')).toBeDefined();

    selectB();
    await waitSeason('b');
    expect(screen.queryByText('Игрок А')).toBeNull();
    expect(screen.getByText('Пересчитываем сезон…')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Сезоны рейтинга/ }));
    await settleSeason('b');
    fireEvent.click(screen.getByRole('button', { name: /Сезоны рейтинга/ }));
    await waitSeason('b');
    expect(screen.queryByText('Игрок А')).toBeNull();
    expect(screen.queryByText('Игрок Б')).toBeNull();
    await settleSeason('b');
    expect(await screen.findByText('Игрок Б')).toBeDefined();
  });

  it('does not refresh old A after an A override completes under selected B', async () => {
    mount();
    await waitSeason('a');
    await settleSeason('a');
    fireEvent.click(screen.getByRole('button', { name: 'Включить' }));
    const putUrl = '/api/rating-periods/a/evenings/eve-a';
    await waitFor(() => expect((pending.get(putUrl) || []).length).toBe(1));

    selectB();
    await waitSeason('b');
    await settleSeason('b');
    await act(async () => { take(putUrl, {}); await Promise.resolve(); });
    expect(await screen.findByText('Игрок Б')).toBeDefined();
    expect(requests.filter((path) => seasonPaths('a').includes(path))).toHaveLength(3);
  });
});
