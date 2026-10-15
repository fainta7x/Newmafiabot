/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerMetricRatings from '../components/player/PlayerMetricRatings.tsx';

const body = (metricKey: string, rows: any[], extra: Record<string, unknown> = {}) => ({
  metric: { key: metricKey, label: metricKey === 'elo_gain' ? 'Прирост Elo' : metricKey === 'win_rate' ? 'Винрейт' : 'Победы', group: 'Победы', unit: metricKey === 'elo_gain' ? 'elo' : 'count', hint: 'Подсказка', min_games: null, min_sample: null },
  metrics: [{ key: 'wins', label: 'Победы', group: 'Победы' }, { key: 'win_rate', label: 'Винрейт', group: 'Победы' }, { key: 'elo_gain', label: 'Прирост Elo', group: 'Elo' }],
  filters: { period: 'all', format: 'all', period_label: 'Всё время', format_label: 'Все форматы', seasons: [{ key: 'period:autumn', label: 'Осень 2026' }], formats: [{ key: 'RATING', label: 'Рейтинговый' }] },
  games_in_scope: 12, total: rows.length, rows, me: null, ...extra,
});
const row = (rank: number, id: string, nickname: string, value: number, text: string, me = false) => ({ rank, player_id: id, nickname, avatar_url: null, value, value_text: text, games: 7, is_me: me });
const respond = (payload: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('rankings by figure', () => {
  it('lists the leaders, marks the viewer and reloads for another figure, season and format', async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('metric=elo_gain')) return respond(body('elo_gain', [row(1, 'a', 'Анна', 24.4, '+24'), row(2, 'b', 'Борис', -12, '−12', true)]));
      return respond(body('wins', [row(1, 'a', 'Анна', 9, '9'), row(2, 'c', 'Вера', 8, '8')], { me: row(14, 'm', 'Я сам', 2, '2', true) }));
    });
    vi.stubGlobal('fetch', fetcher);
    render(<PlayerMetricRatings />);
    expect(await screen.findByTestId('metric-row-a')).toBeDefined();
    expect(within(screen.getByTestId('metric-row-m')).getByText('я')).toBeDefined();
    expect(screen.getByTestId('metric-ratings-scope').textContent).toContain('Всё время · Все форматы, игр в выборе: 12');

    fireEvent.change(screen.getByLabelText('Показатель'), { target: { value: 'elo_gain' } });
    await waitFor(() => expect(screen.getByText('+24')).toBeDefined());
    expect(screen.getByText('−12')).toBeDefined();
    expect(screen.getByTestId('metric-ratings-scope').textContent).toContain('а не сам Elo');

    fireEvent.change(screen.getByLabelText('Период рейтинга'), { target: { value: 'period:autumn' } });
    fireEvent.change(screen.getByLabelText('Формат вечера рейтинга'), { target: { value: 'RATING' } });
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).includes('metric=elo_gain&period=period%3Aautumn&format=RATING'))).toBe(true));
  });

  it('explains a no-observations ranking and shows an error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(body('win_rate', []))));
    render(<PlayerMetricRatings />);
    expect(await screen.findByText('По этому показателю пока нет подтверждённых данных за выбранный период.')).toBeDefined();
    cleanup();
    vi.stubGlobal('fetch', vi.fn(() => respond({ error: 'Сбой' }, 500)));
    render(<PlayerMetricRatings />);
    expect((await screen.findByRole('alert')).textContent).toContain('Сбой');
  });

  it('keeps the filter options while a new ranking loads', async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => { resolveRequest = resolve; });
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(() => (++call === 1
      ? respond(body('wins', [row(1, 'a', 'Анна', 9, '9')]))
      : pending)));
    render(<PlayerMetricRatings />);
    expect(await screen.findByTestId('metric-row-a')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Период рейтинга'), { target: { value: 'period:autumn' } });
    expect(screen.getByLabelText('Период рейтинга')).toBeDefined();
    expect(screen.getByRole('option', { name: 'Осень 2026' })).toBeDefined();
    expect(screen.queryByTestId('metric-row-a')).toBeNull();
    resolveRequest?.(new Response(JSON.stringify(body('wins', [row(1, 'b', 'Борис', 4, '4')])), { status: 200 }));
    expect(await screen.findByTestId('metric-row-b')).toBeDefined();
  });

  it('shows a pair ranking as «victim — when this player is in the black team»', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(body('night_pairs', [{ ...row(1, 'a', 'Богданчик', 4, '4'), partner_nickname: 'Иван', sample_text: 'из 9 общих игр' }]))));
    render(<PlayerMetricRatings />);
    const line = await screen.findByTestId('metric-row-a');
    expect(line.textContent).toContain('Богданчик');
    expect(line.textContent).toContain('убит, когда в чёрных Иван');
    expect(line.textContent).toContain('из 9 общих игр');
  });
});
