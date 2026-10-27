/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicJoinView } from '../components/public/PublicJoinView.vk-direct.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const slot = (n: number, selected = false) => ({
  id: `s${n}`, slot_number: n, starts_at: `2026-10-02T1${7 + n}:00:00Z`, ends_at: `2026-10-02T1${8 + n}:00:00Z`,
  price: 100, target_players: 11, registered_count: 3, selected, participants: [],
});
const plan = (selected: string[]) => ({
  event: { price_per_game: 100, assembled: false, assembled_slots: 0, required_slots: 2, required_players_per_slot: 11 },
  slots: [slot(1, selected.includes('s1')), slot(2, selected.includes('s2'))],
  selection: { slot_ids: selected, games: selected.length, total: selected.length * 100 },
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('VK join page', () => {
  it('saves games only after «Записаться», and then lets the player change them', async () => {
    const posts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/join-state')) return json({ vk_authenticated: true, authenticated: true, player: { nickname: 'Чагин' } });
      if (url.endsWith('/slots') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return json(plan(body.slot_ids));
      }
      if (url.endsWith('/slots')) return json(plan([]));
      return json({ id: 'ev', title: 'Игровой вечер', starts_at: '2026-10-02T18:00:00Z', venue: 'Суп с Котом', default_price: 100 });
    }));
    render(<PublicJoinView eveningId="ev" />);

    fireEvent.click(await screen.findByRole('button', { name: /Игра 1/ }));
    expect(posts).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /Записаться · 1 игр/ }));
    await waitFor(() => expect(posts).toEqual([{ slot_ids: ['s1'] }]));
    expect(await screen.findByText(/Готово, запись есть!/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Игра 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    await waitFor(() => expect(posts).toEqual([{ slot_ids: ['s1'] }, { slot_ids: ['s1', 's2'] }]));
  });
});


it('shows the one-time rating entry before saving a changed two-game selection', async () => {
  const posts: unknown[] = [];
  const ratingPlan = () => ({ ...plan([]), event: { ...plan([]).event, format: 'RATING', price_per_game: 650 }, pricing: { casual_game: 100, casual_cap: 400, novice_game: 200, novice_cap: null, rating_entry: 650 } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    if (url.endsWith('/join-state')) return json({ vk_authenticated: true, authenticated: true, player: { nickname: 'Игрок' } });
    if (url.endsWith('/slots')) return json(ratingPlan());
    return json({ id: 'rating', title: 'Рейтинг', format: 'RATING', starts_at: '2026-11-06T18:00:00Z' });
  }));
  render(<PublicJoinView eveningId="rating" />);
  fireEvent.click(await screen.findByRole('button', { name: /Игра 1/ }));
  fireEvent.click(screen.getByRole('button', { name: /Игра 2/ }));
  expect(screen.getByLabelText('Предварительная стоимость').textContent).toBe('650 ₽');
  expect(posts).toEqual([]);
});
