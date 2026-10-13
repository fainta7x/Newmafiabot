/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppUsagePanel } from '../components/crm/AppUsagePanel.tsx';

const body = { players: [
  { player_id: 'p1', nickname: 'Богдан', visits: 14, active_days: 6, last_seen_at: '2026-10-12T19:40:00.000Z', screens: [{ name: '/player/poker', visits: 9 }, { name: '/player/school/trainer', visits: 2 }] },
  { player_id: 'p2', nickname: 'Пристань', visits: 1, active_days: 1, last_seen_at: '2026-10-11T10:05:00.000Z', screens: [{ name: '/player/events', visits: 1 }] },
] };

describe('«Кто куда заходил»', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('lists every player with visits and Russian screen names, and filters by nickname', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))));
    render(<AppUsagePanel period="30d" />);
    expect(await screen.findByText('Богдан')).toBeTruthy();
    expect(screen.getByText('заходил 14 раз')).toBeTruthy();
    expect(screen.getByText('заходил 1 раз')).toBeTruthy();
    // Never the raw path: «player» must not show up as a screen name.
    expect(screen.getByText('Игрок · Покер')).toBeTruthy();
    expect(screen.queryByText('/player/poker')).toBeNull();
    fireEvent.change(screen.getByLabelText('Найти игрока'), { target: { value: 'при' } });
    expect(screen.queryByText('Богдан')).toBeNull();
    expect(screen.getByText('Пристань')).toBeTruthy();
  });

  it('tells plainly when there is no data yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ players: [] }), { status: 200 }))));
    render(<AppUsagePanel period="30d" />);
    expect(await screen.findByText(/данных нет/)).toBeTruthy();
  });
});
