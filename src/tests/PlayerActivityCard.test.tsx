/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerActivityCard from '../components/crm/PlayerActivityCard.tsx';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PlayerActivityCard', () => {
  it('shows visits, last seen, the screens, the clicks in plain words and when the history starts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({
      days: 30, tracking_since: '2026-10-05T08:00:00.000Z', last_seen_at: '2026-10-05T11:02:00.000Z',
      visits: { total: 5, last_7_days: 3, today: 1 }, active_days: 2,
      by_day: [{ day: '2026-10-05', visits: 2, events: 6 }],
      top_screens: [{ name: '/player/rating', opens: 4 }],
      top_actions: [{ name: 'player-nav-games', count: 2 }, { name: 'profile-tab-elo', count: 1 }],
      recent: [{ at: '2026-10-05T11:02:00.000Z', kind: 'action', name: 'profile-tab-elo' }],
      online_now: null,
    })));
    render(<PlayerActivityCard playerId="p1" />);
    expect(await screen.findByText('Рейтинг · Elo')).toBeDefined();
    expect(screen.getAllByText('Меню · Игры').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Профиль · вкладка «Elo»').length).toBeGreaterThan(0);
    expect(screen.getByText('2 захода')).toBeDefined();
    expect(screen.getByText(/Учёт ведётся с/)).toBeDefined();
  });

  it('says the player is online now and on which screen', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ days: 30, tracking_since: null, last_seen_at: null, visits: { total: 0, last_7_days: 0, today: 0 }, active_days: 0, by_day: [], top_screens: [], top_actions: [], recent: [], online_now: { screen: '/player/club', on_screen_seconds: 20 } })));
    render(<PlayerActivityCard playerId="p1" />);
    expect(await screen.findByText(/Сейчас в приложении: Клуб/)).toBeDefined();
  });

  it('reports a load error instead of staying empty', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'Нет доступа' }, 403)));
    render(<PlayerActivityCard playerId="p1" />);
    expect(await screen.findByText('Нет доступа')).toBeDefined();
  });
});
